// GET /api/jobs/[id]/lock-status — whether this job is locked (invoiced to its
// full quoted amount, see migration 20260815100000) and whether an owner/admin
// has already overridden that lock.
//
// Mobile-only reason this exists as a route rather than a local query: quotes
// are deliberately NOT synced to staff devices (sync-rules.yaml — "staff …
// Never quotes/invoices"), so a staff member's phone has no local way to
// compute "is this job fully invoiced" at all. The web client instead computes
// this straight from its existing server-rendered job query (same visibility
// the FinancialStatBox on that page already relies on) — this route is purely
// for mobile.
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { invoiceGuard, jobTotal, approvedVariationTotal } from '@/lib/job-financials'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: job } = await service
    .from('jobs')
    .select('company_id, invoice_lock_override, quotes!quote_id(total)')
    .eq('id', id)
    .single()
  if (!job || job.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const quote = job.quotes as unknown as { total: number } | null
  // Tax-INCLUSIVE totals on both sides. This route mirrors job_is_locked(),
  // which used to sum invoice subtotals (net) against the quote's inclusive
  // total and so reported a job unlocked until roughly a GST rate more had
  // been billed; fixed on both sides in 20260820100000_variations.sql.
  const { data: invoiceRows } = await service.from('invoices').select('total, status').eq('job_id', id)
  const alreadyInvoiced = (invoiceRows ?? [])
    .filter(i => i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.total ?? 0), 0)

  // Approved variations raise the ceiling, so a job with signed-off extra work
  // stops reading as locked on the phone too.
  const { data: variationRows } = await service.from('variations').select('status, total').eq('job_id', id)
  const ceiling = jobTotal(
    quote?.total ?? null,
    alreadyInvoiced,
    approvedVariationTotal((variationRows ?? []).map(v => ({ status: v.status, amount: v.total }))),
  )

  const overridden = !!job.invoice_lock_override
  const guard = invoiceGuard({ jobTotal: quote ? ceiling : 0, alreadyInvoiced, subtotal: 0, force: overridden })
  return NextResponse.json({ locked: guard === 'fully-invoiced', overridden })
}
