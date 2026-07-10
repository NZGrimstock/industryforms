// POST /api/invoices/[id]/review-request
//
// Called from the in-app "Record payment" flow after the invoice flips to
// `paid`. The helper is idempotent (invoices.review_request_sent_at), so it
// is safe if the Stripe webhook also fires for the same invoice.

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { maybeSendReviewRequest } from '@/lib/review-request'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Auth: only owner/admin in the invoice's company may trigger it.
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data: inv } = await createServiceClient().from('invoices').select('company_id').eq('id', id).single()
  if (!inv || inv.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const service = createServiceClient()
  await maybeSendReviewRequest(service, id)
  return NextResponse.json({ ok: true })
}
