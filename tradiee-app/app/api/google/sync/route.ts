import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncVisitToCalendar } from '@/lib/google-calendar'

export async function POST(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, google_refresh_token')
    .eq('id', user.id)
    .single()

  if (!profile?.google_refresh_token) {
    return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 400 })
  }

  const now = new Date()
  const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)

  const { data: visits, error } = await supabase
    .from('job_visits')
    .select('id, jobs!inner(company_id)')
    .eq('jobs.company_id', profile.company_id)
    .gte('scheduled_start', now.toISOString())
    .lte('scheduled_start', in60Days.toISOString())
    .neq('status', 'cancelled')

  if (error) {
    console.error('Failed to fetch visits for sync:', error)
    return NextResponse.json({ error: 'Failed to fetch visits' }, { status: 500 })
  }

  if (!visits || visits.length === 0) {
    return NextResponse.json({ synced: 0 })
  }

  let synced = 0
  const errors: string[] = []

  for (const visit of visits) {
    try {
      await syncVisitToCalendar(visit.id, user.id)
      synced++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`Failed to sync visit ${visit.id}:`, msg)
      errors.push(`Visit ${visit.id}: ${msg}`)
    }
  }

  if (errors.length > 0 && synced === 0) {
    return NextResponse.json({ error: 'All syncs failed', details: errors }, { status: 500 })
  }

  return NextResponse.json({ synced, errors: errors.length > 0 ? errors : undefined })
}
