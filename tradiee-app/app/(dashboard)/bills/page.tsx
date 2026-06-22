import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { FileMinus, Plus } from 'lucide-react'

export default async function BillsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  let query = supabase
    .from('bills')
    .select('id, reference, status, total, amount_paid, due_date, bill_date, suppliers(name), jobs(job_number)')
    .eq('company_id', profile!.company_id)
  if (sp.status) query = query.eq('status', sp.status)
  const { data: bills } = await query.order('created_at', { ascending: false })

  const statuses = ['unpaid', 'partially_paid', 'paid']
  const outstanding = (bills ?? []).filter(b => b.status !== 'paid').reduce((s, b) => s + (Number(b.total) - Number(b.amount_paid)), 0)

  return (
    <>
      <Header title="Bills" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex gap-1 overflow-x-auto">
            <Link href="/bills" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!sp.status ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>All</Link>
            {statuses.map(s => (
              <Link key={s} href={`/bills?status=${s}`} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${sp.status === s ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s.replace('_', ' ')}</Link>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-500">Owed: <strong className="text-gray-900">{formatCurrency(outstanding)}</strong></p>
            <Link href="/bills/new" className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <Plus className="h-4 w-4" /> Record bill
            </Link>
          </div>
        </div>

        {!bills?.length ? (
          <EmptyState icon={FileMinus} title="No bills" description="Record what you owe suppliers" action={
            <Link href="/bills/new" className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Plus className="h-4 w-4" /> Record bill
            </Link>
          } />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Reference</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Supplier</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Job</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Total</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Owing</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bills.map(b => {
                  const owing = Number(b.total) - Number(b.amount_paid)
                  const overdue = b.status !== 'paid' && b.due_date && new Date(b.due_date) < new Date()
                  return (
                    <tr key={b.id} className="hover:bg-gray-50 cursor-pointer">
                      <td className="p-0"><Link href={`/bills/${b.id}`} className="block px-6 py-3 font-medium text-gray-900">{b.reference ?? '—'}</Link></td>
                      <td className="p-0"><Link href={`/bills/${b.id}`} className="block px-6 py-3 text-gray-700">{(b.suppliers as unknown as {name: string} | null)?.name ?? '—'}</Link></td>
                      <td className="p-0"><Link href={`/bills/${b.id}`} className="block px-6 py-3 text-gray-500">{(b.jobs as unknown as {job_number: string} | null)?.job_number ?? '—'}</Link></td>
                      <td className="p-0"><Link href={`/bills/${b.id}`} className="block px-6 py-3"><StatusBadge status={b.status} /></Link></td>
                      <td className="p-0"><Link href={`/bills/${b.id}`} className="block px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(b.total)}</Link></td>
                      <td className="p-0"><Link href={`/bills/${b.id}`} className={`block px-6 py-3 text-right ${owing > 0 ? 'text-gray-700' : 'text-green-600'}`}>{owing > 0 ? formatCurrency(owing) : 'Paid'}</Link></td>
                      <td className="p-0"><Link href={`/bills/${b.id}`} className={`block px-6 py-3 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{b.due_date ? formatDate(b.due_date) : '—'}</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  )
}
