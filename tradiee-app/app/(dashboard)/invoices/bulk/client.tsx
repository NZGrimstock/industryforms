'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

type Job = { id: string; job_number: string; title: string; customer: string; hasQuote: boolean }

export function BulkInvoiceClient({ jobs }: { jobs: Job[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const allSelected = selected.size === jobs.length && jobs.length > 0
  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(jobs.map(j => j.id)))
  }

  async function generate() {
    if (selected.size === 0) { toast('Select at least one job', 'error'); return }
    setLoading(true)
    const res = await fetch('/api/invoices/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: [...selected] }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { toast(data.error ?? 'Failed', 'error'); return }
    toast(`Created ${data.created} draft invoice${data.created === 1 ? '' : 's'}`)
    router.push('/invoices?status=draft')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{selected.size} of {jobs.length} selected</p>
        <Button loading={loading} disabled={selected.size === 0} onClick={generate}>
          Generate {selected.size > 0 ? selected.size : ''} draft invoice{selected.size === 1 ? '' : 's'}
        </Button>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-gray-500">
              <th className="w-10 px-4 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" /></th>
              <th className="text-left px-3 py-3 font-medium">Job #</th>
              <th className="text-left px-3 py-3 font-medium">Title</th>
              <th className="text-left px-3 py-3 font-medium">Customer</th>
              <th className="text-left px-3 py-3 font-medium">Source amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {jobs.map(j => (
              <tr key={j.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => toggle(j.id)}>
                <td className="px-4 py-3"><input type="checkbox" checked={selected.has(j.id)} onChange={() => toggle(j.id)} onClick={e => e.stopPropagation()} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" /></td>
                <td className="px-3 py-3 font-medium text-gray-900">{j.job_number}</td>
                <td className="px-3 py-3 text-gray-700 max-w-[240px] truncate">{j.title}</td>
                <td className="px-3 py-3 text-gray-600">{j.customer}</td>
                <td className="px-3 py-3 text-gray-400">{j.hasQuote ? 'From quote' : 'Blank (edit after)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-gray-400">Each job becomes a separate draft invoice with a &ldquo;Work completed&rdquo; line at the quoted total (or blank if there&rsquo;s no quote). Review and edit each before sending.</p>
    </div>
  )
}
