import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSearch } from '@/components/ui/list-search'
import { formatCurrency } from '@/lib/utils'
import { InvoicesListTable } from '@/components/invoices/invoices-list-table'
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

  let query = supabase.from('invoices').select('*, customers(name, email, phone)').eq('company_id', profile!.company_id)
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
            <Link href="/invoices/templates" className="text-sm font-medium text-[var(--accent,#f97316)] hover:underline whitespace-nowrap">Templates</Link>
            <Link href="/invoices/bulk" className="text-sm font-medium text-[var(--accent,#f97316)] hover:underline whitespace-nowrap">Bulk invoice</Link>
            <p className="text-sm text-gray-500">Outstanding: <strong className="text-gray-900">{formatCurrency(totalOutstanding)}</strong></p>
          </div>
        </div>

        <ListSearch placeholder="Search invoices by number or reference…" basePath="/invoices" status={sp.status} defaultValue={sp.q} />

        {!invoices?.length ? (
          <EmptyState icon={Receipt} title="No invoices" description="Create invoices from completed jobs" />
        ) : (
          <InvoicesListTable
            invoices={invoices as unknown as Parameters<typeof InvoicesListTable>[0]['invoices']}
            params={params}
            sort={sp.sort}
            dir={sp.dir}
          />
        )}
      </div>
    </>
  )
}
