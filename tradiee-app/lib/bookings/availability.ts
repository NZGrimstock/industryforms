// Availability engine: generates concurrency-safe, timezone-correct booking
// slots from business hours + blackouts + existing job_visits + live holds.
//
// Scope note: availability_rules/blackouts can be company-wide (profile_id
// null) or per-staff. This first version resolves against ONE staff context
// at a time — either a specific profileId, or the company-wide (profile_id
// IS NULL) rules when none is given. Aggregating "any of several staff" into
// a single merged slot list is a reasonable fast-follow, not needed for a
// correct, safe first version.

import { zonedTimeToUtc, zonedDateParts } from './timezone'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export type Slot = { startsAt: string; endsAt: string; profileId: string | null }

type Settings = {
  timezone: string
  min_notice_hours: number
  max_days_ahead: number
  slot_interval_minutes: number
}

const DEFAULT_SETTINGS: Settings = {
  timezone: 'Pacific/Auckland',
  min_notice_hours: 12,
  max_days_ahead: 45,
  slot_interval_minutes: 30,
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export async function getAvailableSlots(
  supabase: SupabaseClient,
  companyId: string,
  packageId: string,
  profileId?: string | null
): Promise<Slot[]> {
  const [{ data: settingsRow }, { data: pkg }] = await Promise.all([
    supabase.from('booking_settings').select('timezone, min_notice_hours, max_days_ahead, slot_interval_minutes').eq('company_id', companyId).maybeSingle(),
    supabase.from('bookable_packages').select('duration_minutes, buffer_before_minutes, buffer_after_minutes, is_active').eq('id', packageId).eq('company_id', companyId).single(),
  ])
  if (!pkg || !pkg.is_active) return []

  const settings: Settings = { ...DEFAULT_SETTINGS, ...(settingsRow ?? {}) }
  const durationMs = pkg.duration_minutes * 60000
  const bufferBeforeMs = (pkg.buffer_before_minutes ?? 0) * 60000
  const bufferAfterMs = (pkg.buffer_after_minutes ?? 0) * 60000

  const now = new Date()
  const rangeStart = now
  const rangeEnd = new Date(now.getTime() + settings.max_days_ahead * 86400000)
  const notBefore = new Date(now.getTime() + settings.min_notice_hours * 3600000)

  const rulesQuery = supabase.from('booking_availability_rules').select('day_of_week, starts_at, ends_at, profile_id')
    .eq('company_id', companyId).eq('is_active', true)
  const { data: rules } = profileId
    ? await rulesQuery.eq('profile_id', profileId)
    : await rulesQuery.is('profile_id', null)
  if (!rules || rules.length === 0) return []

  const blackoutsQuery = supabase.from('booking_blackouts').select('starts_at, ends_at, profile_id')
    .eq('company_id', companyId).lte('starts_at', rangeEnd.toISOString()).gte('ends_at', rangeStart.toISOString())
  const { data: blackouts } = profileId
    ? await blackoutsQuery.or(`profile_id.eq.${profileId},profile_id.is.null`)
    : await blackoutsQuery.is('profile_id', null)

  let visitsQuery = supabase.from('job_visits').select('scheduled_start, scheduled_end, assigned_to, jobs!inner(company_id)')
    .eq('jobs.company_id', companyId)
    .lte('scheduled_start', rangeEnd.toISOString()).gte('scheduled_end', rangeStart.toISOString())
  if (profileId) visitsQuery = visitsQuery.eq('assigned_to', profileId)
  const { data: visits } = await visitsQuery

  let bookingsQuery = supabase.from('bookings').select('starts_at, ends_at, assigned_to, status, hold_expires_at')
    .eq('company_id', companyId)
    .in('status', ['slot_held', 'requested', 'deposit_pending', 'confirmed', 'scheduled'])
    .lte('starts_at', rangeEnd.toISOString()).gte('ends_at', rangeStart.toISOString())
  if (profileId) bookingsQuery = bookingsQuery.eq('assigned_to', profileId)
  const { data: liveBookings } = await bookingsQuery

  // Expired holds don't block — filter them out here even though a stale row
  // may still exist (the reap cron / inline reap-on-attempt clean these up,
  // but availability must be correct even between reaps).
  const nowMs = now.getTime()
  const busyRanges: { start: number; end: number }[] = [
    ...((visits ?? []) as { scheduled_start: string; scheduled_end: string }[]).map(v => ({ start: new Date(v.scheduled_start).getTime(), end: new Date(v.scheduled_end).getTime() })),
    ...((liveBookings ?? []) as { starts_at: string; ends_at: string; status: string; hold_expires_at: string | null }[])
      .filter(b => b.status !== 'slot_held' || !b.hold_expires_at || new Date(b.hold_expires_at).getTime() > nowMs)
      .map(b => ({ start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime() })),
    ...((blackouts ?? []) as { starts_at: string; ends_at: string }[]).map(b => ({ start: new Date(b.starts_at).getTime(), end: new Date(b.ends_at).getTime() })),
  ]

  const slots: Slot[] = []
  const dayMs = 86400000
  for (let t = rangeStart.getTime(); t < rangeEnd.getTime(); t += dayMs) {
    const { year, month, day, weekday } = zonedDateParts(new Date(t), settings.timezone)
    const dayRules = (rules as { day_of_week: number; starts_at: string; ends_at: string; profile_id: string | null }[])
      .filter(r => r.day_of_week === weekday)

    for (const rule of dayRules) {
      const [startH, startM] = rule.starts_at.split(':').map(Number)
      const [endH, endM] = rule.ends_at.split(':').map(Number)
      const windowStart = zonedTimeToUtc(year, month, day, startH, startM, settings.timezone).getTime()
      const windowEnd = zonedTimeToUtc(year, month, day, endH, endM, settings.timezone).getTime()

      for (let slotStart = windowStart; slotStart + durationMs <= windowEnd; slotStart += settings.slot_interval_minutes * 60000) {
        if (slotStart < notBefore.getTime()) continue
        const slotEnd = slotStart + durationMs
        const blockedStart = slotStart - bufferBeforeMs
        const blockedEnd = slotEnd + bufferAfterMs
        const blocked = busyRanges.some(r => overlaps(blockedStart, blockedEnd, r.start, r.end))
        if (blocked) continue
        slots.push({
          startsAt: new Date(slotStart).toISOString(),
          endsAt: new Date(slotEnd).toISOString(),
          profileId: rule.profile_id,
        })
      }
    }
  }

  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/**
 * Attempt to hold a slot. Two layers of safety:
 *  1. Best-effort reap of an expired hold on this exact slot first (keeps a
 *     retried request from being blocked by its own predecessor's leftover row).
 *  2. The actual insert — atomicity comes from a partial unique index on
 *     (company_id, assigned_to, starts_at) for live statuses, not from this
 *     code. Two concurrent callers both attempting the same slot will race at
 *     the database level; exactly one INSERT succeeds, the other gets a
 *     unique-violation (Postgres code 23505).
 */
export async function tryHoldSlot(
  supabase: SupabaseClient,
  params: { companyId: string; packageId: string; assignedTo: string | null; startsAt: string; endsAt: string; customerName?: string }
): Promise<{ id: string } | { error: string }> {
  const { companyId, packageId, assignedTo, startsAt, endsAt, customerName } = params

  let reapQuery = supabase.from('bookings')
    .update({ status: 'cancelled' })
    .eq('company_id', companyId)
    .eq('starts_at', startsAt)
    .eq('status', 'slot_held')
    .lt('hold_expires_at', new Date().toISOString())
  reapQuery = assignedTo ? reapQuery.eq('assigned_to', assignedTo) : reapQuery.is('assigned_to', null)
  await reapQuery

  const holdExpiresAt = new Date(Date.now() + 10 * 60000).toISOString()
  const { data, error } = await supabase.from('bookings').insert({
    company_id: companyId,
    package_id: packageId,
    assigned_to: assignedTo,
    starts_at: startsAt,
    ends_at: endsAt,
    status: 'slot_held',
    hold_expires_at: holdExpiresAt,
    customer_name: customerName ?? '',
  }).select('id').single()

  if (error) {
    if (error.code === '23505') return { error: 'That slot was just taken — pick another.' }
    return { error: error.message }
  }
  return { id: data.id }
}
