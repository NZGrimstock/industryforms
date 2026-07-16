// POST /api/admin/tap-to-pay-launch-email
// Super-admin only. One-time (per user) launch EMAIL for Tap to Pay on iPhone —
// Apple App Review requirement 6.1 ("launch email, sent on the first day of Tap
// to Pay being available"). Sends the Apple-approved launch email to every
// eligible merchant (owner/admin with an email) who hasn't been sent it yet,
// then stamps them so re-running is safe and only covers newly-eligible users.
//
// Does NOT auto-fire — a super-admin triggers it at go-live, alongside the
// launch push (/api/admin/tap-to-pay-launch). Pass { dryRun: true } to preview
// the recipient count without sending.
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail, tapToPayLaunchEmailHtml } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('is_super_admin').eq('id', user.id).single()
  if (!profile?.is_super_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { dryRun } = await req.json().catch(() => ({}))

  // Eligible = owner/admin (only they can enable Tap to Pay) with an email,
  // not already sent the launch email.
  const { data: rows } = await service
    .from('profiles')
    .select('id, email, full_name')
    .in('role', ['owner', 'admin'])
    .not('email', 'is', null)
    .is('tap_to_pay_launch_email_at', null)

  const recipients = ((rows ?? []) as { id: string; email: string | null; full_name: string | null }[])
    .filter((r): r is { id: string; email: string; full_name: string | null } => !!r.email)

  if (dryRun) return NextResponse.json({ eligible: recipients.length, dryRun: true })
  if (recipients.length === 0) return NextResponse.json({ sent: 0, failed: 0 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.industryforms.app'

  const sentIds: string[] = []
  let failed = 0
  for (const r of recipients) {
    const { subject, html } = tapToPayLaunchEmailHtml({
      recipientName: r.full_name?.split(' ')[0] || 'there',
      appUrl,
    })
    const result = await sendEmail({ to: r.email, subject, html })
    if ('error' in result) failed++
    else sentIds.push(r.id)
  }

  // Only stamp the ones that actually sent, so failures are retried next run.
  if (sentIds.length) {
    await service.from('profiles').update({ tap_to_pay_launch_email_at: new Date().toISOString() }).in('id', sentIds)
  }

  return NextResponse.json({ sent: sentIds.length, failed })
}
