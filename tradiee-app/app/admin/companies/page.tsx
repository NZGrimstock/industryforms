import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export default async function AdminCompanies() {
  const s = createServiceClient()
  const { data: companies } = await s
    .from('companies')
    .select(`
      id, name, country, trade_type, created_at,
      profiles(id, full_name, email, role, is_super_admin)
    `)
    .order('created_at', { ascending: false })

  const rows = companies ?? []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Companies</h1>
        <p className="text-gray-400 text-sm mt-1">{rows.length} registered</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 text-gray-400 font-medium">Company</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">Country</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">Trade</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">Users</th>
              <th className="text-left px-5 py-3 text-gray-400 font-medium">Joined</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const users = Array.isArray(c.profiles) ? c.profiles : []
              return (
                <tr key={c.id} className={i < rows.length - 1 ? 'border-b border-gray-800' : ''}>
                  <td className="px-5 py-3">
                    <p className="text-white font-medium">{c.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{c.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-3 text-gray-400">{c.country ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-400">{c.trade_type ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className="text-white font-medium">{users.length}</span>
                    {users.length > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[160px]">
                        {users.map(u => u.full_name || u.email).join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/admin/companies/${c.id}`}
                      className="text-orange-400 hover:text-orange-300 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500">No companies yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
