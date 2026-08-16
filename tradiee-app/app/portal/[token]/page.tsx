import { createServiceClient } from '@/lib/supabase/server'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Wrench } from 'lucide-react'

export default async function CustomerPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createServiceClient()

  // Look up the portal token
  const { data: portalToken } = await supabase
    .from('customer_portal_tokens')
    .select('customer_id, company_id, email, expires_at')
    .eq('token', token)
    .single()

  if (!portalToken || new Date(portalToken.expires_at) < new Date()) {
    return <ExpiredPage />
  }

  const { customer_id, company_id } = portalToken

  // Fetch company, customer, jobs and invoices in parallel
  const [companyRes, customerRes, jobsRes, invoicesRes] = await Promise.all([
    supabase
      .from('companies')
      .select('name, email, phone, logo_url')
      .eq('id', company_id)
      .single(),
    supabase
      .from('customers')
      .select('name')
      .eq('id', customer_id)
      .single(),
    supabase
      .from('jobs')
      .select('id, job_number, title, status, description, created_at')
      .eq('customer_id', customer_id)
      .eq('company_id', company_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, amount_paid, due_date, public_token')
      .eq('customer_id', customer_id)
      .eq('company_id', company_id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false }),
  ])

  const company = companyRes.data
  const customer = customerRes.data
  const jobs = jobsRes.data ?? []
  const invoices = invoicesRes.data ?? []

  if (!company || !customer) {
    return <ExpiredPage />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={company.name} className="h-8 object-contain" />
            ) : (
              <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-white" />
              </div>
            )}
            <span className="font-semibold text-gray-900">{company.name}</span>
          </div>
          <div className="text-right text-xs text-gray-400">
            {company.email && <p>{company.email}</p>}
            {company.phone && <p>{company.phone}</p>}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Greeting */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h1 className="text-xl font-bold text-gray-900">Hi {customer.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Here&apos;s a summary of your jobs and invoices with {company.name}.
          </p>
        </div>

        {/* Jobs */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Jobs</h2>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-400 px-6 py-4">No jobs yet.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/portal/${token}/jobs/${job.id}`}
                    className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400">{job.job_number}</span>
                        <JobStatusBadge status={job.status} />
                      </div>
                      <p className="text-sm text-gray-800 font-medium mt-0.5 truncate">{job.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(job.created_at)}</p>
                    </div>
                    <span className="text-gray-300 ml-4">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Invoices */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Invoices</h2>
          </div>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-400 px-6 py-4">No invoices yet.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {invoices.map((inv) => {
                const unpaid = inv.status === 'sent' || inv.status === 'partially_paid' || inv.status === 'overdue'
                return (
                  <li key={inv.id} className="flex items-center justify-between px-6 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{inv.invoice_number}</span>
                        <InvoiceStatusBadge status={inv.status} />
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5">{formatCurrency(inv.total)}</p>
                      {inv.due_date && (
                        <p className="text-xs text-gray-400 mt-0.5">Due {formatDate(inv.due_date)}</p>
                      )}
                    </div>
                    {unpaid && inv.public_token && (
                      <Link
                        href={`/i/${inv.public_token}`}
                        className="ml-4 shrink-0 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Pay
                      </Link>
                    )}
                    {!unpaid && inv.public_token && (
                      <Link
                        href={`/i/${inv.public_token}`}
                        className="ml-4 shrink-0 text-sm text-orange-500 hover:underline"
                      >
                        View
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <p className="text-center text-xs text-gray-300 pb-4">Powered by IndustryForms</p>
      </div>
    </div>
  )
}

function ExpiredPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="bg-orange-500 px-8 py-6">
          <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center mb-3">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Link expired</h1>
        </div>
        <div className="px-8 py-6">
          <p className="text-gray-600 mb-4">
            This portal link is no longer valid. Portal links expire after 30 days for security.
          </p>
          <Link
            href="/portal/login"
            className="inline-flex rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Request a new link
          </Link>
          <p className="mt-4 text-gray-500 text-sm">
            If your email is not recognised, contact your tradie and ask them to send you a portal link.
          </p>
        </div>
      </div>
    </div>
  )
}

const JOB_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unscheduled: { label: 'Unscheduled', className: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In progress', className: 'bg-orange-100 text-orange-700' },
  on_hold: { label: 'On hold', className: 'bg-yellow-100 text-yellow-700' },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-600' },
}

function JobStatusBadge({ status }: { status: string }) {
  const config = JOB_STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}

const INVOICE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  sent: { label: 'Unpaid', className: 'bg-blue-100 text-blue-700' },
  partially_paid: { label: 'Part paid', className: 'bg-yellow-100 text-yellow-700' },
  paid: { label: 'Paid', className: 'bg-green-100 text-green-700' },
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-600' },
  void: { label: 'Void', className: 'bg-gray-100 text-gray-400' },
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const config = INVOICE_STATUS_CONFIG[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
