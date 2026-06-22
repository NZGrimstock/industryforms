import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSearch } from '@/components/ui/list-search'
import { SortHeader } from '@/components/ui/sort-header'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Receipt } from 'lucide-react'

const SORTABLE = ['invoice_number', 'status', 'total', 'due_date', 'created_at']

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; sort?: string; dir?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const sortCol = SORTABLE.includes(sp.sort ?? '') ? sp.sort! : 'created_at'
  const asc = sp.sort ? sp.dir === 'asc' : false
  const params = { ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}) }

  let query = supabase.from('invoices').select('*, customers(name)').eq('company_id', profile!.company_id)
  if (sp.status) query = query.eq('status', sp.status)
  if (sp.q) query = query.or(`invoice_number.ilike.%${sp.q}%,reference.ilike.%${sp.q}%`)
  const { data: invoices } = await query.order(sortCol, { ascending: asc })

  const statuses = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void']

  const totalOutstanding = (invoices ?? [])
    .filter(i => ['sent', 'partially_paid', 'overdue'].includes(i.status))
    .reduce((sum, i) => sum + (i.total - i.amount_paid), 0)

  return (
    <>
      <Header title="Invoices" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto">
            <Link href="/invoices" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!sp.status ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</Link>
            {statuses.map(s => (
              <Link key={s} href={`/invoices?status=${s}`} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${sp.status === s ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s.replace(/_/g, ' ')}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <Link href="/invoices/bulk" className="text-sm font-medium text-orange-600 hover:underline whitespace-nowrap">Bulk invoice</Link>
            <p className="text-sm text-gray-500">Outstanding: <strong className="text-gray-900">{formatCurrency(totalOutstanding)}</strong></p>
          </div>
        </div>

        <ListSearch placeholder="Search invoices by number or reference…" basePath="/invoices" status={sp.status} defaultValue={sp.q} />

        {!invoices?.length ? (
          <EmptyState icon={Receipt} title="No invoices" description="Create invoices from completed jobs" />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Invoice #" column="invoice_number" basePath="/invoices" params={params} sort={sp.sort} dir={sp.dir} /></th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Reference</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Status" column="status" basePath="/invoices" params={params} sort={sp.sort} dir={sp.dir} /></th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500"><SortHeader label="Total" column="total" basePath="/invoices" params={params} sort={sp.sort} dir={sp.dir} align="right" /></th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Outstanding</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Due" column="due_date" basePath="/invoices" params={params} sort={sp.sort} dir={sp.dir} /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map(i => (
                  <tr key={i.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 font-medium text-gray-900">{i.invoice_number}</Link></td>
                    <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 text-gray-700">{(i.customers as {name: string} | null)?.name ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 text-gray-400">{i.reference ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3"><StatusBadge status={i.status} /></Link></td>
                    <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(i.total)}</Link></td>
                    <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 text-right text-gray-600">
                      {i.total - i.amount_paid > 0 ? <span className={i.status === 'overdue' ? 'text-red-600 font-medium' : ''}>{formatCurrency(i.total - i.amount_paid)}</span> : <span className="text-green-600">Paid</span>}
                    </Link></td>
                    <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 text-gray-500">{formatDate(i.due_date)}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}
