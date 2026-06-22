import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate, formatCurrency, formatDateTime } from '@/lib/utils'
import Link from 'next/link'
import { CustomerDetailClient } from './client'
import { SmsThread } from '@/components/customers/sms-thread'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const { data: customer } = await supabase
    .from('customers')
    .select('*, customer_sites(*)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (!customer) notFound()

  const [quotesRes, jobsRes, invoicesRes, commsRes, messagesRes] = await Promise.all([
    supabase.from('quotes').select('id, quote_number, status, total, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('jobs').select('id, job_number, title, status, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('invoices').select('id, invoice_number, status, total, amount_paid, due_date').eq('customer_id', id).order('created_at', { ascending: false }).limit(10),
    supabase.from('communications').select('id, channel, direction, subject, summary, created_at').eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    supabase.from('customer_messages').select('id, direction, body, created_at').eq('customer_id', id).order('created_at', { ascending: true }).limit(200),
  ])

  return (
    <>
      <Header title={customer.name} profile={profile} />
      <div className="p-6 space-y-6">
        <CustomerDetailClient customer={customer} companyId={profile!.company_id} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quotes */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Quotes</CardTitle>
                <Link href={`/quotes/new?customerId=${id}`} className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">+ New</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(quotesRes.data ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No quotes</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {(quotesRes.data ?? []).map(q => (
                    <li key={q.id}>
                      <Link href={`/quotes/${q.id}`} className="flex items-center justify-between px-6 py-2.5 hover:bg-gray-50 text-sm">
                        <span className="text-gray-700">{q.quote_number}</span>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={q.status} />
                          <span className="text-gray-500">{formatCurrency(q.total)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Jobs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Jobs</CardTitle>
                <Link href={`/jobs/new?customerId=${id}`} className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">+ New</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(jobsRes.data ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No jobs</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {(jobsRes.data ?? []).map(j => (
                    <li key={j.id}>
                      <Link href={`/jobs/${j.id}`} className="flex items-center justify-between px-6 py-2.5 hover:bg-gray-50 text-sm">
                        <div>
                          <p className="text-gray-700">{j.job_number}</p>
                          <p className="text-xs text-gray-400 truncate">{j.title}</p>
                        </div>
                        <StatusBadge status={j.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Invoices */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Invoices</CardTitle>
                <Link href={`/invoices/new?customerId=${id}`} className="text-xs text-orange-500 hover:text-[var(--accent,#f97316)]">+ New</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(invoicesRes.data ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No invoices</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {(invoicesRes.data ?? []).map(i => (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="flex items-center justify-between px-6 py-2.5 hover:bg-gray-50 text-sm">
                        <div>
                          <p className="text-gray-700">{i.invoice_number}</p>
                          {i.due_date && <p className="text-xs text-gray-400">Due {formatDate(i.due_date)}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={i.status} />
                          <span className="text-gray-500">{formatCurrency(i.total)}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SMS thread (owner/admin only — RLS already enforces) */}
        {(profile?.role === 'owner' || profile?.role === 'admin') && (
          <Card>
            <CardHeader><CardTitle>Text messages</CardTitle></CardHeader>
            <CardContent>
              <SmsThread
                customerId={id}
                customerPhone={customer.phone ?? null}
                initial={(messagesRes.data ?? []) as { id: string; direction: 'inbound' | 'outbound'; body: string; created_at: string }[]}
              />
            </CardContent>
          </Card>
        )}

        {/* Communications history */}
        <Card>
          <CardHeader><CardTitle>Communications</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(commsRes.data ?? []).length === 0 ? (
              <p className="px-6 py-4 text-sm text-gray-400">No emails or texts logged yet.</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {(commsRes.data ?? []).map((c: { id: string; channel: string; direction: string; subject: string | null; summary: string | null; created_at: string }) => (
                  <li key={c.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${c.channel === 'sms' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{c.channel}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 truncate">{c.subject ?? c.summary}</p>
                      {c.subject && c.summary && <p className="text-xs text-gray-400 truncate">{c.summary}</p>}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDateTime(c.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
