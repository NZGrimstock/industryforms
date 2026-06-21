// Records an outbound/inbound customer communication for the history log.
// Best-effort: never throws into the caller (logging must not break sends).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logCommunication(client: any, entry: {
  companyId: string
  customerId?: string | null
  channel: 'email' | 'sms'
  direction?: 'outbound' | 'inbound'
  subject?: string | null
  summary?: string | null
  relatedType?: string | null
  relatedId?: string | null
}) {
  try {
    await client.from('communications').insert({
      company_id: entry.companyId,
      customer_id: entry.customerId ?? null,
      channel: entry.channel,
      direction: entry.direction ?? 'outbound',
      subject: entry.subject ?? null,
      summary: entry.summary ?? null,
      related_type: entry.relatedType ?? null,
      related_id: entry.relatedId ?? null,
    })
  } catch {
    // swallow — logging is non-critical
  }
}
