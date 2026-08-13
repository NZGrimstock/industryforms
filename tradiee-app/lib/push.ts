// Expo push helper — shared by /api/notify (session-triggered) and the
// service-client webhooks below that can't go through a session route
// (Twilio inbound, public lead capture).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

export type PushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  categoryId?: string
}

export async function sendExpoPush(messages: PushMessage[]) {
  if (!messages.length) return
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
}

// Push every owner/admin in a company about a new inbox item (SMS or
// enquiry/lead). `key` matches the unified inbox conversation key
// (sms:<customerId> | sms-unmatched:<id> | enquiry:<id>) so the mobile app's
// notification-tap and Reply/Quote/Call actions can target the right thread.
export async function notifyCompanyInbox(
  supabase: SupabaseClient,
  companyId: string,
  opts: { title: string; body: string; key: string; phone?: string | null }
) {
  const { data: admins } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('company_id', companyId)
    .in('role', ['owner', 'admin'])
    .not('expo_push_token', 'is', null)

  const messages: PushMessage[] = ((admins ?? []) as { expo_push_token: string | null }[])
    .filter((a): a is { expo_push_token: string } => !!a.expo_push_token)
    .map(a => ({
      to: a.expo_push_token,
      title: opts.title,
      body: opts.body,
      data: { screen: 'thread', key: opts.key, phone: opts.phone ?? null },
      categoryId: 'inbox_message',
    }))

  await sendExpoPush(messages)
}

// Push everyone involved in a job about a new message on its thread — every
// owner/admin in the company plus every assignee (primary `jobs.assigned_to`
// and any `job_assignees`), minus the author.
//
// Deliberately NOT "admin wrote → notify techs, tech wrote → notify admins":
// notifying every participant except the author is both simpler and more
// correct, since a second worker on a multi-assignee job needs to see the
// conversation too. It also matches the read visibility RLS already grants
// (migration 20260701082916) — nobody is pushed a message they couldn't open.
//
// `data.screen: 'job'` is already routed by the mobile app's notification
// response listener (app/_layout.tsx), so tapping opens the job. No new
// notification category: the lock-screen Reply/Quote/Call actions on
// `inbox_message` are customer-SMS specific and don't apply here.
// Pure recipient decision, split out from the query plumbing so it can be
// checked without a database — see scripts/check-job-thread-recipients.mjs.
export function jobThreadRecipients<T extends { id: string; role: string; expo_push_token: string | null }>(
  people: T[],
  assigneeIds: Set<string>,
  authorId: string
): T[] {
  return people.filter(p =>
    p.id !== authorId &&
    !!p.expo_push_token &&
    (p.role === 'owner' || p.role === 'admin' || assigneeIds.has(p.id))
  )
}

export async function notifyJobThread(
  supabase: SupabaseClient,
  opts: { jobId: string; companyId: string; authorId: string; authorName: string; jobNumber: string; body: string }
) {
  const [{ data: assigneeRows }, { data: job }, { data: people }] = await Promise.all([
    supabase.from('job_assignees').select('profile_id').eq('job_id', opts.jobId),
    supabase.from('jobs').select('assigned_to').eq('id', opts.jobId).single(),
    supabase
      .from('profiles')
      .select('id, role, expo_push_token')
      .eq('company_id', opts.companyId)
      .not('expo_push_token', 'is', null),
  ])

  const assignees = new Set<string>(
    ((assigneeRows ?? []) as { profile_id: string | null }[])
      .map(a => a.profile_id)
      .filter((v): v is string => !!v)
  )
  if (job?.assigned_to) assignees.add(job.assigned_to as string)

  const messages: PushMessage[] = jobThreadRecipients(
    (people ?? []) as { id: string; role: string; expo_push_token: string | null }[],
    assignees,
    opts.authorId,
  )
    .map(p => ({
      to: p.expo_push_token!,
      title: `${opts.jobNumber} · ${opts.authorName}`,
      body: opts.body,
      data: { screen: 'job', jobId: opts.jobId },
    }))

  await sendExpoPush(messages)
}
