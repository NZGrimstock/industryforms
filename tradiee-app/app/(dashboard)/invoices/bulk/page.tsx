import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { EmptyState } from '@/components/ui/empty-state'
import { Receipt } from 'lucide-react'
import { BulkInvoiceClient } from './client'
import { redirectIfFreePlan } from '@/lib/billing-guards'
import type { BillingCompany } from '@/lib/billing'

export default async function BulkInvoicePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role, companies!company_id(subscription_plan, subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until)').eq('id', user!.id).single()
  redirectIfFreePlan(profile?.companies as unknown as BillingCompany | null)

  // Completed jobs that don't yet have an invoice.
  const { data: invoiced } = await supabase.from('invoices').select('job_id').eq('company_id', profile!.company_id).not('job_id', 'is', null)
  const invoicedJobIds = new Set((invoiced ?? []).map(i => i.job_id))

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, title, customers(name), quote_id')
    .eq('company_id', profile!.company_id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  const uninvoiced = (jobs ?? [])
    .filter(j => !invoicedJobIds.has(j.id))
    .map(j => ({ id: j.id, job_number: j.job_number, title: j.title, customer: (j.customers as unknown as { name: string } | null)?.name ?? '—', hasQuote: !!j.quote_id }))

  return (
    <>
      <Header title="Bulk invoicing" profile={profile} />
      <div className="p-6">
        {uninvoiced.length === 0 ? (
          <EmptyState icon={Receipt} title="Nothing to invoice" description="Completed jobs without an invoice will appear here." />
        ) : (
          <BulkInvoiceClient jobs={uninvoiced} />
        )}
      </div>
    </>
  )
}
