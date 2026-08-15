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
import { invoiceGuard } from '@/lib/job-financials'

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
  const { data: invoiceRows } = await service.from('invoices').select('subtotal, status').eq('job_id', id)
  const alreadyInvoiced = (invoiceRows ?? [])
    .filter(i => i.status !== 'void')
    .reduce((sum, i) => sum + Number(i.subtotal ?? 0), 0)

  const overridden = !!job.invoice_lock_override
  const guard = invoiceGuard({ jobTotal: Number(quote?.total ?? 0), alreadyInvoiced, subtotal: 0, force: overridden })
  return NextResponse.json({ locked: guard === 'fully-invoiced', overridden })
}
