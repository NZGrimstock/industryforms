'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { SortHeader } from '@/components/ui/sort-header'
import { InlineStatus } from '@/components/jobs/inline-status'
import { DeleteConfirmButton } from '@/components/ui/delete-confirm-button'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { useToast } from '@/components/ui/toast'
import { formatDate } from '@/lib/utils'
import { createBatchInvoices, type BatchInvoiceJob } from '@/lib/batch-invoice'
import { Receipt, MessageSquare, Mail, Printer, Loader2 } from 'lucide-react'

type Job = {
  id: string
  job_number: string
  title: string
  status: string
  created_at: string
  customer_id: string
  quote_id: string | null
  reference: string | null
  customers: { name: string } | null
  profiles: { full_name: string } | null
}

export function JobsListTable({
  jobs, jobStatuses, companyId, gstRate, sortParams, sort, dir,
}: {
  jobs: Job[]
  jobStatuses: { key: string; label: string; color: string; is_terminal?: boolean }[]
  companyId: string
  gstRate: number
  sortParams: Record<string, string>
  sort?: string
  dir?: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const allChecked = jobs.length > 0 && selected.size === jobs.length
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(jobs.map(j => j.id)))
  }
  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const doneStatus = jobStatuses.find(s => s.is_terminal && s.key !== 'cancelled') ?? jobStatuses.find(s => s.key === 'completed')

  function summarize(result: { created: { jobId: string; invoiceId: string }[]; skipped: { jobId: string; title: string; reason: string }[] }) {
    const parts = [`${result.created.length} invoice${result.created.length === 1 ? '' : 's'} created`]
    if (result.skipped.length) parts.push(`${result.skipped.length} skipped (${[...new Set(result.skipped.map(s => s.reason))].join(', ')})`)
    return parts.join(' — ')
  }

  async function batchInvoice(after: 'none' | 'sms' | 'email' | 'print') {
    const targets: BatchInvoiceJob[] = jobs
      .filter(j => selected.has(j.id))
      .map(j => ({ id: j.id, title: j.title, customer_id: j.customer_id, quote_id: j.quote_id, reference: j.reference }))
    if (targets.length === 0) return

    setBusy(true)
    try {
      const result = await createBatchInvoices(supabase, targets, { companyId, gstRate, doneStatusKey: doneStatus?.key ?? null })
      toast(summarize(result), result.created.length > 0 ? 'success' : 'error')

      if (result.created.length > 0) {
        if (after === 'sms') {
          await Promise.all(result.created.map(c => fetch('/api/sms/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: c.invoiceId }) })))
          toast('Texted where a customer phone number was on file')
        } else if (after === 'email') {
          await Promise.all(result.created.map(c => fetch('/api/email/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: c.invoiceId }) })))
          toast('Emailed where a customer email was on file')
        } else if (after === 'print') {
          // Sequential, not Promise.all — most browsers only allow one
          // popup per user gesture before treating the rest as blocked.
          for (const c of result.created) {
            const res = await fetch(`/api/invoices/${c.invoiceId}/pdf`)
            const data = await res.json().catch(() => null)
            if (data?.url) window.open(data.url, '_blank')
          }
          toast('Opened PDFs in new tabs — allow pop-ups if any were blocked')
        }
      }

      setSelected(new Set())
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-orange-50 border-b border-orange-100">
          <span className="text-sm font-medium text-orange-800">{selected.size} job{selected.size === 1 ? '' : 's'} selected</span>
          <Dropdown label={busy ? 'Working…' : 'Batch Invoice'} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} variant="primary" disabled={busy}>
            <DropdownItem icon={<Receipt />} onClick={() => batchInvoice('none')}>Batch Invoice</DropdownItem>
            <DropdownItem icon={<MessageSquare />} onClick={() => batchInvoice('sms')}>Batch Invoice and SMS</DropdownItem>
            <DropdownItem icon={<Mail />} onClick={() => batchInvoice('email')}>Batch Invoice and Email</DropdownItem>
            <DropdownItem icon={<Printer />} onClick={() => batchInvoice('print')}>Batch Invoice and Print</DropdownItem>
          </Dropdown>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="w-10 px-3 py-3">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all jobs" className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
            </th>
            <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Job #" column="job_number" basePath="/jobs" params={sortParams} sort={sort} dir={dir} /></th>
            <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Title" column="title" basePath="/jobs" params={sortParams} sort={sort} dir={dir} /></th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Reference</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Status" column="status" basePath="/jobs" params={sortParams} sort={sort} dir={dir} /></th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Assigned to</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Created" column="created_at" basePath="/jobs" params={sortParams} sort={sort} dir={dir} /></th>
            <th className="w-10 px-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {jobs.map(j => (
            <tr key={j.id} className={`hover:bg-gray-50 cursor-pointer ${selected.has(j.id) ? 'bg-orange-50/40' : ''}`}>
              <td className="px-3 py-3">
                <input type="checkbox" checked={selected.has(j.id)} onChange={() => toggle(j.id)} aria-label={`Select ${j.job_number}`} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
              </td>
              <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 font-medium text-gray-900">{j.job_number}</Link></td>
              <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-700 max-w-[200px] truncate">{j.title}</Link></td>
              <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-600">{j.customers?.name ?? '—'}</Link></td>
              <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-400">{j.reference ?? '—'}</Link></td>
              <td className="px-6 py-3"><InlineStatus jobId={j.id} status={j.status} statuses={jobStatuses} /></td>
              <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-500">{j.profiles?.full_name ?? '—'}</Link></td>
              <td className="p-0"><Link href={`/jobs/${j.id}`} className="block px-6 py-3 text-gray-400">{formatDate(j.created_at)}</Link></td>
              <td className="px-3"><DeleteConfirmButton id={j.id} table="jobs" label="job" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
