'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addInterval } from '@/lib/datetime'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import type { CustomerStatement } from '@/lib/statement'
import { Mail, MessageSquare, Printer, Loader2, Send } from 'lucide-react'

type Row = { customer: { id: string; name: string; email: string | null; phone: string | null }; statement: CustomerStatement }

const INTERVAL_OPTIONS = [
  { value: '', label: 'Off — I\'ll run it myself, whenever' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
]

export function StatementsClient({
  rows, currency, companyId, initialInterval, initialNext,
}: {
  rows: Row[]
  currency: string
  companyId: string
  initialInterval: string | null
  initialNext: string | null
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set(rows.map(r => r.customer.id)))
  const [busy, setBusy] = useState(false)
  const [interval, setIntervalValue] = useState(initialInterval ?? '')
  const [nextDate, setNextDate] = useState(initialNext)
  const [savingSchedule, setSavingSchedule] = useState(false)

  const allChecked = rows.length > 0 && selected.size === rows.length
  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map(r => r.customer.id)))
  }
  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedRows = rows.filter(r => selected.has(r.customer.id))
  const selectedTotal = selectedRows.reduce((sum, r) => sum + r.statement.outstanding, 0)

  async function saveSchedule() {
    setSavingSchedule(true)
    try {
      const next = interval ? addInterval(new Date().toISOString().slice(0, 10), interval) : null
      const { error } = await supabase.from('companies').update({
        statement_run_interval: interval || null,
        statement_run_next: next,
      }).eq('id', companyId)
      if (error) { toast('Could not save schedule', 'error'); return }
      setNextDate(next)
      toast(interval ? `We'll remind you ${interval} — next nudge ${next}` : 'Automatic reminder turned off')
    } finally {
      setSavingSchedule(false)
    }
  }

  async function runBatch(channel: 'email' | 'sms' | 'print') {
    if (selectedRows.length === 0) return
    setBusy(true)
    try {
      if (channel === 'email') {
        const withEmail = selectedRows.filter(r => r.customer.email)
        const results = await Promise.all(withEmail.map(r =>
          fetch('/api/email/statement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: r.customer.id }) })
            .then(res => res.ok)
        ))
        const ok = results.filter(Boolean).length
        toast(`Emailed ${ok} of ${selectedRows.length} statement${selectedRows.length === 1 ? '' : 's'}${withEmail.length < selectedRows.length ? ` (${selectedRows.length - withEmail.length} have no email on file)` : ''}`, ok > 0 ? 'success' : 'error')
      } else if (channel === 'sms') {
        const withPhone = selectedRows.filter(r => r.customer.phone)
        const results = await Promise.all(withPhone.map(r =>
          fetch('/api/sms/statement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: r.customer.id }) })
            .then(res => res.ok)
        ))
        const ok = results.filter(Boolean).length
        toast(`Texted ${ok} of ${selectedRows.length} statement${selectedRows.length === 1 ? '' : 's'}${withPhone.length < selectedRows.length ? ` (${selectedRows.length - withPhone.length} have no phone on file)` : ''}`, ok > 0 ? 'success' : 'error')
      } else {
        // Sequential — most browsers only allow one popup per user gesture
        // before treating further window.open calls as blocked.
        for (const r of selectedRows) {
          const res = await fetch(`/api/statements/${r.customer.id}/pdf`)
          const data = await res.json().catch(() => null)
          if (data?.url) window.open(data.url, '_blank')
        }
        toast('Opened PDFs in new tabs — allow pop-ups if any were blocked')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-medium text-gray-900 mb-1">Remind me to run statements</p>
            <p className="text-xs text-gray-500 mb-2">
              Just a nudge — we&apos;ll email you when it&apos;s due, nothing gets sent automatically.
              {nextDate && interval ? ` Next reminder: ${nextDate}.` : ''}
            </p>
            <Select
              value={interval}
              onChange={e => setIntervalValue(e.target.value)}
              options={INTERVAL_OPTIONS}
            />
          </div>
          <Button variant="outline" onClick={saveSchedule} disabled={savingSchedule || interval === (initialInterval ?? '')}>
            {savingSchedule ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 py-8 text-center">No customers currently have an outstanding balance.</p>
        ) : (
          <>
            {selected.size > 0 && (
              <div className="flex items-center justify-between gap-3 px-6 py-2.5 bg-orange-50 border-b border-orange-100">
                <span className="text-sm font-medium text-orange-800">
                  {selected.size} customer{selected.size === 1 ? '' : 's'} selected — {formatCurrency(selectedTotal, currency)} total
                </span>
                <Dropdown label={busy ? 'Working…' : 'Send statements'} icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} variant="primary" disabled={busy}>
                  <DropdownItem icon={<Mail />} onClick={() => runBatch('email')}>Email selected</DropdownItem>
                  <DropdownItem icon={<MessageSquare />} onClick={() => runBatch('sms')}>SMS selected</DropdownItem>
                  <DropdownItem icon={<Printer />} onClick={() => runBatch('print')}>Print selected</DropdownItem>
                </Dropdown>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all customers" className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                  </th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Current</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">1-30 days</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">31-60 days</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">61+ days</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(r => (
                  <tr key={r.customer.id} className={selected.has(r.customer.id) ? 'bg-orange-50/40' : ''}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(r.customer.id)} onChange={() => toggle(r.customer.id)} aria-label={`Select ${r.customer.name}`} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                    </td>
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{r.customer.name}</p>
                      <p className="text-xs text-gray-400">{r.customer.email ?? 'no email'} · {r.customer.phone ?? 'no phone'}</p>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-600">{r.statement.current > 0 ? formatCurrency(r.statement.current, currency) : '—'}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{r.statement.d30 > 0 ? formatCurrency(r.statement.d30, currency) : '—'}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{r.statement.d60 > 0 ? formatCurrency(r.statement.d60, currency) : '—'}</td>
                    <td className="px-6 py-3 text-right">{r.statement.d90 > 0 ? <span className="text-red-600 font-medium">{formatCurrency(r.statement.d90, currency)}</span> : '—'}</td>
                    <td className="px-6 py-3 text-right font-semibold text-gray-900">{formatCurrency(r.statement.outstanding, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  )
}
