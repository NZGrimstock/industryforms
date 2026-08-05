import type { SupabaseClient } from '@supabase/supabase-js'

export type BatchInvoiceTarget = { id: string; status: string; customer_email: string | null; customer_phone: string | null }

export type BatchCompleteResult = {
  completed: string[] // ids marked sent (were draft, now sent)
  skipped: { id: string; reason: string }[]
}

// Batch counterpart to markSent() in app/(dashboard)/invoices/[id]/client.tsx.
// Only drafts can be completed — matches the single-invoice "Complete
// invoice" button, which only ever appears when isDraft.
export async function batchMarkSent(supabase: SupabaseClient, invoices: BatchInvoiceTarget[]): Promise<BatchCompleteResult> {
  const result: BatchCompleteResult = { completed: [], skipped: [] }
  const drafts = invoices.filter(i => i.status === 'draft')
  for (const i of invoices) {
    if (i.status !== 'draft') result.skipped.push({ id: i.id, reason: 'not a draft' })
  }
  if (drafts.length === 0) return result

  const { error } = await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', drafts.map(i => i.id))
  if (error) {
    for (const i of drafts) result.skipped.push({ id: i.id, reason: error.message })
    return result
  }
  result.completed = drafts.map(i => i.id)
  return result
}
