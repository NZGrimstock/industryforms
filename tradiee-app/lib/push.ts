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
