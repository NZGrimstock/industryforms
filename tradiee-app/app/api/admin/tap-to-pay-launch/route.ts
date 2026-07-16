// POST /api/admin/tap-to-pay-launch
// Super-admin only. One-time (per user) launch push for Tap to Pay on iPhone —
// Apple App Review requirement 6.3. Sends the exact Apple-approved "Value
// proposition" push copy (Marketing Guide, Aug 2025 p.27) to every eligible
// merchant (owner/admin with a push token) who hasn't been sent it yet, then
// stamps them so re-running is safe and only covers newly-eligible users.
//
// Does NOT auto-fire — a super-admin triggers it when Tap to Pay goes live.
// Pass { dryRun: true } to see how many would receive it without sending.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendExpoPush, type PushMessage } from '@/lib/push'

// Apple-approved copy — do not edit (Apple forbids custom product claims).
const LAUNCH_TITLE = 'Accept in-person payments with Tap to Pay on iPhone.'
const LAUNCH_BODY =
  'You can accept all types of contactless payments right on your iPhone — from physical debit and credit cards to Apple Pay and other digital wallets. Terms apply.'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('is_super_admin').eq('id', user.id).single()
  if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { dryRun } = await req.json().catch(() => ({}))

  // Eligible = owner/admin (only they can enable Tap to Pay) with a push token,
  // not already sent the launch push.
  const { data: recipients } = await service
    .from('profiles')
    .select('id, expo_push_token')
    .in('role', ['owner', 'admin'])
    .not('expo_push_token', 'is', null)
    .is('tap_to_pay_launch_push_at', null)

  const eligible = ((recipients ?? []) as { id: string; expo_push_token: string | null }[])
    .filter((r): r is { id: string; expo_push_token: string } => !!r.expo_push_token)

  if (dryRun) return NextResponse.json({ eligible: eligible.length, dryRun: true })
  if (eligible.length === 0) return NextResponse.json({ sent: 0 })

  const messages: PushMessage[] = eligible.map(r => ({
    to: r.expo_push_token,
    title: LAUNCH_TITLE,
    body: LAUNCH_BODY,
    data: { screen: 'pay-now' },
  }))

  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    await sendExpoPush(messages.slice(i, i + 100))
  }

  const now = new Date().toISOString()
  await service.from('profiles').update({ tap_to_pay_launch_push_at: now }).in('id', eligible.map(r => r.id))

  return NextResponse.json({ sent: eligible.length })
}
