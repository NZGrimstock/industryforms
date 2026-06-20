import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'
import { Truck, Plus } from 'lucide-react'

export default async function SuppliersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, email, phone, account_number')
    .eq('company_id', profile!.company_id)
    .order('name')

  return (
    <>
      <Header title="Suppliers" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{suppliers?.length ?? 0} suppliers</p>
          <Link href="/suppliers/new" className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus className="h-4 w-4" /> Add supplier
          </Link>
        </div>

        {!suppliers?.length ? (
          <EmptyState icon={Truck} title="No suppliers yet" description="Add suppliers to raise purchase orders" action={
            <Link href="/suppliers/new" className="inline-flex items-center gap-2 bg-orange-500 text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Plus className="h-4 w-4" /> Add supplier
            </Link>
          } />
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Phone</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {suppliers.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="p-0"><Link href={`/suppliers/${s.id}`} className="block px-6 py-3 font-medium text-gray-900">{s.name}</Link></td>
                    <td className="p-0"><Link href={`/suppliers/${s.id}`} className="block px-6 py-3 text-gray-600">{s.email ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/suppliers/${s.id}`} className="block px-6 py-3 text-gray-600">{s.phone ?? '—'}</Link></td>
                    <td className="p-0"><Link href={`/suppliers/${s.id}`} className="block px-6 py-3 text-gray-500">{s.account_number ?? '—'}</Link></td>
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
