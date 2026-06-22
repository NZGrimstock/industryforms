import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSearch } from '@/components/ui/list-search'
import { SortHeader } from '@/components/ui/sort-header'
import { TemplateMenu } from './template-menu'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'

const statuses = ['draft', 'sent', 'accepted', 'declined', 'expired']
const SORTABLE = ['quote_number', 'status', 'total', 'created_at']

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; sort?: string; dir?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const sortCol = SORTABLE.includes(sp.sort ?? '') ? sp.sort! : 'created_at'
  const asc = sp.sort ? sp.dir === 'asc' : false
  const params = { ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}) }

  let query = supabase.from('quotes').select('*, customers(name)').eq('company_id', profile!.company_id)
  if (sp.status) query = query.eq('status', sp.status)
  if (sp.q) query = query.or(`quote_number.ilike.%${sp.q}%,title.ilike.%${sp.q}%,reference.ilike.%${sp.q}%`)
  const { data: quotes } = await query.order(sortCol, { ascending: asc })
  const { data: templates } = await supabase.from('document_templates').select('id, name').eq('company_id', profile!.company_id).eq('kind', 'quote').order('name')

  return (
    <>
      <Header title="Quotes" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex gap-1 overflow-x-auto">
            <Link href="/quotes" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!sp.status ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</Link>
            {statuses.map(s => (
              <Link key={s} href={`/quotes?status=${s}`} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${sp.status === s ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <TemplateMenu templates={templates ?? []} />
            <Link href="/quotes/new" className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Plus className="h-4 w-4" /> New quote
            </Link>
          </div>
        </div>

        <ListSearch placeholder="Search quotes by number, title or reference…" basePath="/quotes" status={sp.status} defaultValue={sp.q} />

        {!quotes?.length ? (
          <EmptyState icon={FileText} title="No quotes" description="Create your first quote to get started" action={
            <Link href="/quotes/new" className="inline-flex items-center gap-2 bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Plus className="h-4 w-4" /> New quote
            </Link>
          } />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Quote #" column="quote_number" basePath="/quotes" params={params} sort={sp.sort} dir={sp.dir} /></th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Title</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Reference</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Status" column="status" basePath="/quotes" params={params} sort={sp.sort} dir={sp.dir} /></th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500"><SortHeader label="Total" column="total" basePath="/quotes" params={params} sort={sp.sort} dir={sp.dir} align="right" /></th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Date" column="created_at" basePath="/quotes" params={params} sort={sp.sort} dir={sp.dir} /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quotes.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="p-0"><Link href={`/quotes/${q.id}`} className="block px-6 py-3 font-medium text-gray-900">{q.quote_number}</Link></td>
                    <td className="p-0"><Link href={`/quotes/${q.id}`} className="block px-6 py-3 text-gray-700">{(q.customers as {name: string} | null)?.name ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/quotes/${q.id}`} className="block px-6 py-3 text-gray-600 truncate max-w-[200px]">{q.title}</Link></td>
                    <td className="p-0"><Link href={`/quotes/${q.id}`} className="block px-6 py-3 text-gray-400">{q.reference ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/quotes/${q.id}`} className="block px-6 py-3"><StatusBadge status={q.status} /></Link></td>
                    <td className="p-0"><Link href={`/quotes/${q.id}`} className="block px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(q.total)}</Link></td>
                    <td className="p-0"><Link href={`/quotes/${q.id}`} className="block px-6 py-3 text-gray-500">{formatDate(q.created_at)}</Link></td>
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
