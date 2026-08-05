'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { SortHeader } from '@/components/ui/sort-header'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import { batchMarkSent, type BatchInvoiceTarget } from '@/lib/batch-complete-invoice'
import { CheckCircle2, MessageSquare, Mail, Printer, Loader2 } from 'lucide-react'

type Invoice = {
  id: string
  invoice_number: string
  status: string
  total: number
  amount_paid: number
  reference: string | null
  due_date: string | null
  customers: { name: string; email: string | null; phone: string | null } | null
}

export function InvoicesListTable({
  invoices, params, sort, dir,
}: {
  invoices: Invoice[]
  params: Record<string, string>
  sort?: string
  dir?: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const allChecked = invoices.length > 0 && selected.size === invoices.length
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(invoices.map(i => i.id)))
  }
  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function summarize(result: { completed: string[]; skipped: { id: string; reason: string }[] }) {
    const parts = [`${result.completed.length} invoice${result.completed.length === 1 ? '' : 's'} completed`]
    if (result.skipped.length) parts.push(`${result.skipped.length} skipped (${[...new Set(result.skipped.map(s => s.reason))].join(', ')})`)
    return parts.join(' — ')
  }

  async function batchComplete(after: 'none' | 'sms' | 'email' | 'print') {
    const targets: BatchInvoiceTarget[] = invoices
      .filter(i => selected.has(i.id))
      .map(i => ({ id: i.id, status: i.status, customer_email: i.customers?.email ?? null, customer_phone: i.customers?.phone ?? null }))
    if (targets.length === 0) return

    setBusy(true)
    try {
      const result = await batchMarkSent(supabase, targets)
      toast(summarize(result), result.completed.length > 0 ? 'success' : 'error')

      // SMS/email/print apply to every selected invoice that now has (or
      // already had) sendable contact details — not just the ones this call
      // just flipped to sent, since re-sending an already-sent invoice is a
      // normal thing to do (mirrors "Complete and SMS" on the detail page,
      // which sends regardless of whether markSent actually changed anything).
      if (after === 'sms') {
        const withPhone = targets.filter(t => t.customer_phone)
        await Promise.all(withPhone.map(t => fetch('/api/sms/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: t.id }) })))
        toast(`Texted ${withPhone.length} of ${targets.length} (rest have no phone on file)`)
      } else if (after === 'email') {
        const withEmail = targets.filter(t => t.customer_email)
        await Promise.all(withEmail.map(t => fetch('/api/email/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: t.id }) })))
        toast(`Emailed ${withEmail.length} of ${targets.length} (rest have no email on file)`)
      } else if (after === 'print') {
        // Sequential — most browsers only allow one popup per user gesture
        // before treating further window.open calls as blocked.
        for (const t of targets) {
          const res = await fetch(`/api/invoices/${t.id}/pdf`)
          const data = await res.json().catch(() => null)
          if (data?.url) window.open(data.url, '_blank')
        }
        toast('Opened PDFs in new tabs — allow pop-ups if any were blocked')
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
          <span className="text-sm font-medium text-orange-800">{selected.size} invoice{selected.size === 1 ? '' : 's'} selected</span>
          <Dropdown label={busy ? 'Working…' : 'Batch Complete'} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} variant="primary" disabled={busy}>
            <DropdownItem icon={<CheckCircle2 />} onClick={() => batchComplete('none')}>Batch Complete</DropdownItem>
            <DropdownItem icon={<MessageSquare />} onClick={() => batchComplete('sms')}>Batch Complete and SMS</DropdownItem>
            <DropdownItem icon={<Mail />} onClick={() => batchComplete('email')}>Batch Complete and Email</DropdownItem>
            <DropdownItem icon={<Printer />} onClick={() => batchComplete('print')}>Batch Complete and Print</DropdownItem>
          </Dropdown>
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="w-10 px-3 py-3">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all invoices" className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
            </th>
            <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Invoice #" column="invoice_number" basePath="/invoices" params={params} sort={sort} dir={dir} /></th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Reference</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Status" column="status" basePath="/invoices" params={params} sort={sort} dir={dir} /></th>
            <th className="text-right px-6 py-3 font-medium text-gray-500"><SortHeader label="Total" column="total" basePath="/invoices" params={params} sort={sort} dir={dir} align="right" /></th>
            <th className="text-right px-6 py-3 font-medium text-gray-500">Outstanding</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500"><SortHeader label="Due" column="due_date" basePath="/invoices" params={params} sort={sort} dir={dir} /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoices.map(i => (
            <tr key={i.id} className={`hover:bg-gray-50 cursor-pointer ${selected.has(i.id) ? 'bg-orange-50/40' : ''}`}>
              <td className="px-3 py-3">
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.invoice_number}`} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
              </td>
              <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 font-medium text-gray-900">{i.invoice_number}</Link></td>
              <td className="p-0"><Link href={`/invoices/${i.id}`} className="block px-6 py-3 text-gray-700">{i.customers?.name ?? '—'}</Link></td>
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
  )
}
