import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'
import { Users, Plus, FileText, Briefcase } from 'lucide-react'
import { RowActions } from '@/components/ui/row-actions'

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', (await supabase.auth.getUser()).data.user!.id).single()

  const { data: customers } = await supabase
    .from('customers')
    .select('*, customer_sites(count)')
    .eq('company_id', profile!.company_id)
    .order('name')

  return (
    <>
      <Header title="Customers" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{customers?.length ?? 0} customers</p>
          <Link href="/customers/new" className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus className="h-4 w-4" /> Add customer
          </Link>
        </div>

        {!customers?.length ? (
          <EmptyState icon={Users} title="No customers yet" description="Add your first customer to get started" action={
            <Link href="/customers/new" className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Plus className="h-4 w-4" /> Add customer
            </Link>
          } />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Type</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Phone</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Sites</th>
                  <th className="w-10 px-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="p-0">
                      <Link href={`/customers/${c.id}`} className="block px-6 py-3 font-medium text-gray-900">
                        {c.name}
                        {c.contact_person && <p className="text-xs text-gray-400 font-normal">{c.contact_person}</p>}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link href={`/customers/${c.id}`} className="block px-6 py-3">
                        <Badge className={c.type === 'commercial' ? 'bg-purple-50 text-purple-700' : ''}>{c.type}</Badge>
                      </Link>
                    </td>
                    <td className="p-0"><Link href={`/customers/${c.id}`} className="block px-6 py-3 text-gray-600">{c.email ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/customers/${c.id}`} className="block px-6 py-3 text-gray-600">{c.phone ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/customers/${c.id}`} className="block px-6 py-3 text-gray-500">{(c.customer_sites as unknown as [{count: number}])?.[0]?.count ?? 0}</Link></td>
                    <td className="px-3 text-right">
                      <RowActions actions={[
                        { label: 'New quote', href: `/quotes/new?customerId=${c.id}`,    icon: <FileText /> },
                        { label: 'New job',   href: `/jobs?newJob=1&customerId=${c.id}`, icon: <Briefcase /> },
                      ]} />
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
