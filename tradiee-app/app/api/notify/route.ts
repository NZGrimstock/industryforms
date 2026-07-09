import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_TIMEZONE, formatTime } from '@/lib/datetime'

const bodySchema = z.union([
  z.object({
    type: z.literal('job_assigned'),
    payload: z.object({
      jobId: z.string().uuid(),
      assignedToId: z.string().uuid(),
      jobTitle: z.string().max(200),
      jobNumber: z.string().max(50),
    }),
  }),
  z.object({
    type: z.literal('visit_reminder'),
    payload: z.object({
      visitId: z.string().uuid(),
      assignedToId: z.string().uuid(),
      jobTitle: z.string().max(200),
      scheduledStart: z.string(),
    }),
  }),
  z.object({ type: z.literal('visit_reminder_batch'), payload: z.unknown().optional() }),
])

type PushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, string>
}

async function sendExpoPush(messages: PushMessage[]) {
  if (!messages.length) return
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
}

// POST /api/notify
// Body: { type: 'job_assigned' | 'visit_reminder', payload: { ... } }
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { type, payload } = parsed.data

  if (type === 'job_assigned') {
    const { jobId, assignedToId, jobTitle, jobNumber } = payload
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token, full_name')
      .eq('id', assignedToId)
      .single()

    if (profile?.expo_push_token) {
      await sendExpoPush([{
        to: profile.expo_push_token,
        title: 'Job assigned to you',
        body: `${jobNumber} — ${jobTitle}`,
        data: { screen: 'job', jobId },
      }])
    }
  }

  if (type === 'visit_reminder') {
    const { visitId, assignedToId, jobTitle, scheduledStart } = payload
    const { data: profile } = await supabase
      .from('profiles')
      .select('expo_push_token, timezone')
      .eq('id', assignedToId)
      .single()

    if (profile?.expo_push_token) {
      const time = formatTime(scheduledStart, profile.timezone ?? DEFAULT_TIMEZONE, { hour12: true })
      await sendExpoPush([{
        to: profile.expo_push_token,
        title: 'Visit reminder',
        body: `${jobTitle} at ${time}`,
        data: { screen: 'visit', visitId },
      }])
    }
  }

  if (type === 'visit_reminder_batch') {
    // Called by cron — send reminders for all visits starting in ~1 hour
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
    const windowStart = new Date(Date.now() + 50 * 60 * 1000).toISOString()
    const windowEnd = oneHourFromNow.toISOString()

    const { data: visits } = await supabase
      .from('job_visits')
      .select('id, scheduled_start, assigned_to, jobs(title, job_number), profiles!assigned_to(expo_push_token, timezone)')
      .gte('scheduled_start', windowStart)
      .lte('scheduled_start', windowEnd)
      .not('assigned_to', 'is', null)

    type VisitRow = {
      id: string
      scheduled_start: string
      jobs: { title: string | null } | null
      profiles: { expo_push_token: string | null; timezone: string | null } | null
    }
    const messages: PushMessage[] = ((visits ?? []) as unknown as VisitRow[])
      .filter(v => v.profiles?.expo_push_token)
      .map(v => {
        const time = formatTime(v.scheduled_start, v.profiles?.timezone ?? DEFAULT_TIMEZONE, { hour12: true })
        return {
          to: v.profiles!.expo_push_token!,
          title: 'Upcoming visit',
          body: `${v.jobs?.title ?? 'Job'} starts at ${time}`,
          data: { screen: 'visit', visitId: v.id },
        }
      })

    await sendExpoPush(messages)
    return NextResponse.json({ sent: messages.length })
  }

  return NextResponse.json({ success: true })
}
