import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { EnquiryActions } from './client'

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string; new?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()
  const { data: team } = await supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true)

  let query = supabase.from('enquiries')
    .select('*, profiles(full_name)')
    .eq('company_id', profile!.company_id)
  if (sp.status) query = query.eq('status', sp.status)
  const { data: enquiries } = await query.order('created_at', { ascending: false })

  const statuses = ['new', 'contacted', 'quoted', 'won', 'lost']

  const statusCounts = await Promise.all(
    statuses.map(s =>
      supabase.from('enquiries').select('id', { count: 'exact', head: true })
        .eq('company_id', profile!.company_id).eq('status', s)
    )
  )

  return (
    <>
      <Header title="Enquiries" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 overflow-x-auto">
            <Link href="/enquiries" className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${!sp.status ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              All ({enquiries?.length ?? 0})
            </Link>
            {statuses.map((s, i) => (
              <Link key={s} href={`/enquiries?status=${s}`} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap capitalize ${sp.status === s ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {s} ({statusCounts[i]?.count ?? 0})
              </Link>
            ))}
          </div>
          <EnquiryActions companyId={profile!.company_id} profileId={user!.id} team={team ?? []} mode="new" initialOpen={sp.new === '1'} />
        </div>

        {!enquiries?.length ? (
          <EmptyState
            icon={MessageSquare}
            title="No enquiries"
            description="Capture incoming leads before they become customers"
            action={<EnquiryActions companyId={profile!.company_id} profileId={user!.id} team={team ?? []} mode="new" />}
          />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Contact</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Source</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Assigned to</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {enquiries.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="p-0">
                      <Link href={`/enquiries/${e.id}`} className="block px-6 py-3 font-medium text-gray-900">
                        {e.customer_name}
                        {e.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px] font-normal">{e.description}</p>}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/enquiries/${e.id}`} className="block px-6 py-3 text-gray-600">
                        {e.customer_email && <p>{e.customer_email}</p>}
                        {e.customer_phone && <p className="text-gray-400">{e.customer_phone}</p>}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/enquiries/${e.id}`} className="block px-6 py-3 text-gray-500 capitalize">{e.source.replace(/_/g, ' ')}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/enquiries/${e.id}`} className="block px-6 py-3"><StatusBadge status={e.status} /></Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/enquiries/${e.id}`} className="block px-6 py-3 text-gray-500">{(e.profiles as {full_name: string} | null)?.full_name ?? '—'}</Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/enquiries/${e.id}`} className="block px-6 py-3 text-gray-400">{formatDate(e.created_at)}</Link>
                    </td>
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
