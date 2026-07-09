import * as TaskManager from 'expo-task-manager'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

export const LOCATION_TASK = 'TRADIEE_LOCATION_TRACKING'

const SPEED_START_MS   = 15 / 3.6   // 15 km/h — start a trip
const SPEED_STOP_MS    =  4 / 3.6   //  4 km/h — considered stopped
const STOP_DURATION_MS = 5 * 60 * 1000  // 5 min stationary → end trip (avoids traffic lights)
const GEOFENCE_RADIUS_KM = 0.15
const GEOFENCE_COOLDOWN_MS = 2 * 60 * 60 * 1000

const STORAGE_KEY     = 'TRADIEE_ACTIVE_TRIP'
const SESSION_KEY     = 'TRADIEE_SESSION'          // mirrored by supabase.ts for BG task access
const ACTIVE_JOB_KEY  = 'TRADIEE_ACTIVE_JOB'
const GEOFENCE_COOLDOWN_KEY = 'TRADIEE_GEOFENCE_LAST_CHECKIN'
// Set by app/on-my-way.tsx after sending "On my way"; cleared here once the
// geofence confirms arrival (Mobile Overhaul brief §8 step 5 — piggybacks the
// existing tracking task instead of a second location subscription).
export const ACTIVE_ETA_KEY = 'TRADIEE_ACTIVE_ETA'
type ActiveEta = { jobId: string; customerId: string; sentAt: string }
export const TRIP_FOLLOWUP_KEY = 'TRADIEE_TRIP_FOLLOWUP'  // consumed by timesheets tab
export const AUTO_CHECKIN_NOTICE_KEY = 'TRADIEE_AUTO_CHECKIN_NOTICE'

type TripState = {
  tripId: string
  startLat: number
  startLng: number
  startTime: string
  lastLat: number
  lastLng: number
  lastMovingAt: string
  distanceKm: number
}

export type TripFollowup = {
  tripId: string
  startTime: string
  endTime: string
  distanceKm: number
}

export type AutoCheckinNotice = {
  jobId: string
  timesheetId: string
  jobNumber: string
  jobTitle: string
  checkedInAt: string
  distanceM: number
}

type SiteJob = {
  id: string
  job_number: string
  title: string
  assigned_to: string | null
  customer_sites: { lat: number | string | null; lng: number | string | null } | { lat: number | string | null; lng: number | string | null }[] | null
}

type Visit = {
  id: string
  job_id: string
  assigned_to: string | null
  scheduled_start: string
  scheduled_end: string | null
  status: string
}

type SecondaryAssignment = { job_id: string }
type OpenTimesheet = { id: string; job_id: string | null; started_at: string }

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

async function getState(): Promise<TripState | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

async function setState(state: TripState | null) {
  if (state) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  else await AsyncStorage.removeItem(STORAGE_KEY)
}

async function getSupabase() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  // Session is mirrored here by supabase.ts; SecureStore is unavailable in BG tasks
  const stored = await AsyncStorage.getItem(SESSION_KEY)
  const session = stored ? JSON.parse(stored) : null
  const client = createClient(url, key, { auth: { persistSession: false } })
  if (session?.access_token) {
    await client.auth.setSession(session)
  }
  return client
}

async function endTrip(state: TripState, endLat: number, endLng: number) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const finalDistance = Math.round(
    (state.distanceKm + haversineKm(state.lastLat, state.lastLng, endLat, endLng)) * 100
  ) / 100
  const endTime = new Date().toISOString()

  await supabase.from('travel_logs').insert({
    id:          state.tripId,
    company_id:  profile?.company_id,
    profile_id:  user.id,
    started_at:  state.startTime,
    ended_at:    endTime,
    start_lat:   state.startLat,
    start_lng:   state.startLng,
    end_lat:     endLat,
    end_lng:     endLng,
    distance_km: finalDistance,
    is_auto:     true,
  })

  // Signal the timesheets tab to prompt the user to start a job timer
  const followup: TripFollowup = {
    tripId:      state.tripId,
    startTime:   state.startTime,
    endTime,
    distanceKm:  finalDistance,
  }
  await AsyncStorage.setItem(TRIP_FOLLOWUP_KEY, JSON.stringify(followup))
}

function siteCoords(job: SiteJob): { lat: number; lng: number } | null {
  const site = Array.isArray(job.customer_sites) ? job.customer_sites[0] : job.customer_sites
  const lat = Number(site?.lat)
  const lng = Number(site?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function matchingVisit(visits: Visit[], jobId: string, userId: string, nowMs: number) {
  const windowBeforeMs = 2 * 60 * 60 * 1000
  const windowAfterMs = 4 * 60 * 60 * 1000
  return visits
    .filter(visit => {
      if (visit.job_id !== jobId) return false
      if (visit.assigned_to && visit.assigned_to !== userId) return false
      if (visit.status === 'completed' || visit.status === 'cancelled') return false
      const start = new Date(visit.scheduled_start).getTime()
      const end = visit.scheduled_end ? new Date(visit.scheduled_end).getTime() : start
      return nowMs >= start - windowBeforeMs && nowMs <= end + windowAfterMs
    })
    .sort((a, b) => Math.abs(new Date(a.scheduled_start).getTime() - nowMs) - Math.abs(new Date(b.scheduled_start).getTime() - nowMs))[0]
}

async function recentlyCheckedIn(jobId: string) {
  const raw = await AsyncStorage.getItem(GEOFENCE_COOLDOWN_KEY)
  if (!raw) return false
  const last = JSON.parse(raw) as { jobId: string; checkedInAt: string }
  return last.jobId === jobId && Date.now() - new Date(last.checkedInAt).getTime() < GEOFENCE_COOLDOWN_MS
}

async function maybeAutoCheckIn(lat: number, lng: number, nowIso: string) {
  // Codex build audit marker (2026-07-07): GPS geo-fence time-clock auto check-in.
  const existingTimer = await AsyncStorage.getItem(ACTIVE_JOB_KEY)
  if (existingTimer) return

  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, title, assigned_to, customer_sites(lat, lng)')
    .eq('company_id', profile.company_id)
    .not('site_id', 'is', null)
    .not('status', 'in', '(completed,cancelled)')
    .limit(100)

  const nearby = ((jobs ?? []) as SiteJob[])
    .map(job => {
      const coords = siteCoords(job)
      if (!coords) return null
      const distanceKm = haversineKm(lat, lng, coords.lat, coords.lng)
      return { job, distanceKm }
    })
    .filter((match): match is { job: SiteJob; distanceKm: number } => !!match && match.distanceKm <= GEOFENCE_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)

  if (!nearby.length) return

  const jobIds = nearby.map(match => match.job.id)
  const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
  const [{ data: visits }, { data: assignments }] = await Promise.all([
    supabase
      .from('job_visits')
      .select('id, job_id, assigned_to, scheduled_start, scheduled_end, status')
      .in('job_id', jobIds)
      .gte('scheduled_end', windowStart)
      .lte('scheduled_start', windowEnd),
    supabase
      .from('job_assignees')
      .select('job_id')
      .eq('profile_id', user.id)
      .in('job_id', jobIds),
  ])

  const visitRows = (visits ?? []) as Visit[]
  const secondaryJobIds = new Set(((assignments ?? []) as SecondaryAssignment[]).map(row => row.job_id))
  const nowMs = new Date(nowIso).getTime()

  for (const match of nearby) {
    if (await recentlyCheckedIn(match.job.id)) continue

    const visit = matchingVisit(visitRows, match.job.id, user.id, nowMs)
    const assignedToUser = match.job.assigned_to === user.id || secondaryJobIds.has(match.job.id) || !!visit
    if (!assignedToUser) continue

    const { data: openTimesheet } = await supabase
      .from('timesheets')
      .select('id, job_id, started_at')
      .eq('profile_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (openTimesheet) {
      const open = openTimesheet as OpenTimesheet
      await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({
        jobId: open.job_id ?? match.job.id,
        timesheetId: open.id,
        startedAt: open.started_at,
        source: 'server',
      }))
      return
    }

    const { data: timesheet, error } = await supabase
      .from('timesheets')
      .insert({
        company_id: profile.company_id,
        job_id: match.job.id,
        visit_id: visit?.id ?? null,
        profile_id: user.id,
        started_at: nowIso,
        ended_at: null,
        break_minutes: 0,
        is_billable: true,
        notes: 'Auto-started by GPS geo-fence.',
      })
      .select('id')
      .single()

    if (error || !timesheet?.id) {
      if ((error as { code?: string } | null)?.code === '23505') {
        const { data: existing } = await supabase
          .from('timesheets')
          .select('id, job_id, started_at')
          .eq('profile_id', user.id)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const open = existing as OpenTimesheet | null
        if (open) {
          await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify({
            jobId: open.job_id ?? match.job.id,
            timesheetId: open.id,
            startedAt: open.started_at,
            source: 'server',
          }))
        }
      }
      return
    }

    if (visit) {
      await supabase
        .from('job_visits')
        .update({ actual_start: nowIso, status: 'in_progress' })
        .eq('id', visit.id)
        .is('actual_start', null)
    }

    const activeJob = {
      jobId: match.job.id,
      timesheetId: timesheet.id,
      startedAt: nowIso,
      source: 'geofence',
    }
    const notice: AutoCheckinNotice = {
      jobId: match.job.id,
      timesheetId: timesheet.id,
      jobNumber: match.job.job_number,
      jobTitle: match.job.title,
      checkedInAt: nowIso,
      distanceM: Math.round(match.distanceKm * 1000),
    }

    await Promise.all([
      AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(activeJob)),
      AsyncStorage.setItem(AUTO_CHECKIN_NOTICE_KEY, JSON.stringify(notice)),
      AsyncStorage.setItem(GEOFENCE_COOLDOWN_KEY, JSON.stringify({ jobId: match.job.id, checkedInAt: nowIso })),
    ])
    return
  }
}

// If the tech sent "On my way" for a job, auto-flip to "Arrived" (and tell
// the customer) once GPS puts them within the existing geofence radius —
// no separate tracking loop, just piggybacking this task's location stream.
async function maybeAutoArrive(lat: number, lng: number) {
  const raw = await AsyncStorage.getItem(ACTIVE_ETA_KEY)
  if (!raw) return
  const eta = JSON.parse(raw) as ActiveEta

  const supabase = await getSupabase()
  const { data: job } = await supabase
    .from('jobs')
    .select('site_id, customer_sites(lat, lng)')
    .eq('id', eta.jobId)
    .single()
  const site = job ? (Array.isArray(job.customer_sites) ? job.customer_sites[0] : job.customer_sites) : null
  const siteLat = Number((site as { lat?: unknown } | null)?.lat)
  const siteLng = Number((site as { lng?: unknown } | null)?.lng)
  if (!Number.isFinite(siteLat) || !Number.isFinite(siteLng)) return
  if (haversineKm(lat, lng, siteLat, siteLng) > GEOFENCE_RADIUS_KM) return

  const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
  const { data: { session } } = await supabase.auth.getSession()
  if (!apiBase || !session?.access_token) return

  await fetch(`${apiBase}/api/sms/eta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ jobId: eta.jobId, status: 'arrived' }),
  }).catch(() => {})
  await AsyncStorage.removeItem(ACTIVE_ETA_KEY)
}

// Must be defined at module scope — called before any component mounts
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: any) => {
  if (error) { console.error('[tracking]', error); return }

  const locations: Location.LocationObject[] = data?.locations ?? []
  if (!locations.length) return

  const loc = locations[locations.length - 1]
  const { latitude: lat, longitude: lng, speed } = loc.coords
  const speedMs = speed ?? 0
  const now = new Date().toISOString()

  await maybeAutoArrive(lat, lng)

  const state = await getState()

  if (speedMs >= SPEED_START_MS) {
    if (!state) {
      await setState({
        tripId:       uuid(),
        startLat:     lat,
        startLng:     lng,
        startTime:    now,
        lastLat:      lat,
        lastLng:      lng,
        lastMovingAt: now,
        distanceKm:   0,
      })
    } else {
      const added = haversineKm(state.lastLat, state.lastLng, lat, lng)
      await setState({ ...state, lastLat: lat, lastLng: lng, lastMovingAt: now, distanceKm: state.distanceKm + added })
    }
  } else if (speedMs < SPEED_STOP_MS && state) {
    const stoppedMs = Date.now() - new Date(state.lastMovingAt).getTime()
    if (stoppedMs >= STOP_DURATION_MS) {
      await endTrip(state, lat, lng)
      await setState(null)
      await maybeAutoCheckIn(lat, lng, now)
    }
  } else if (speedMs < SPEED_STOP_MS && !state && (loc.coords.accuracy ?? 999) <= 100) {
    await maybeAutoCheckIn(lat, lng, now)
  }
})

// ── Public API ──────────────────────────────────────────────────────────────

export async function requestPermissions(): Promise<boolean> {
  const { status: fg } = await Location.requestForegroundPermissionsAsync()
  if (fg !== 'granted') return false
  const { status: bg } = await Location.requestBackgroundPermissionsAsync()
  return bg === 'granted'
}

export async function startTracking() {
  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (already) return
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,         // update every 50 m
    timeInterval: 30_000,         // or every 30 s
    foregroundService: {
      notificationTitle: 'IndustryForms',
      notificationBody:  'Auto-tracking travel and site check-ins',
      notificationColor: '#f97316',
    },
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.AutomotiveNavigation,
  })
}

export async function stopTracking() {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
  if (!running) return
  const state = await getState()
  if (state) {
    const loc = await Location.getLastKnownPositionAsync()
    if (loc) await endTrip(state, loc.coords.latitude, loc.coords.longitude)
    await setState(null)
  }
  await Location.stopLocationUpdatesAsync(LOCATION_TASK)
}

export async function isTracking(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
}
