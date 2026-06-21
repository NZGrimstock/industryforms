'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Repeat } from 'lucide-react'

export function RecurringInvoiceCard({ invoiceId, initial }: {
  invoiceId: string
  initial: { isRecurring: boolean; rule: string | null; next: string | null; end: string | null }
}) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [on, setOn] = useState(initial.isRecurring)
  const [rule, setRule] = useState(initial.rule ?? 'monthly')
  const [next, setNext] = useState(initial.next ?? '')
  const [end, setEnd] = useState(initial.end ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('invoices').update({
      is_recurring: on,
      recurrence_rule: on ? rule : null,
      recurrence_next: on ? (next || new Date().toISOString().slice(0, 10)) : null,
      recurrence_end: on ? (end || null) : null,
    }).eq('id', invoiceId)
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast(on ? 'Recurrence saved' : 'Recurrence turned off')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Repeat className="h-4 w-4 text-gray-400" /> Recurring invoice</CardTitle>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
          Repeat this invoice
        </label>
      </CardHeader>
      {on && (
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <span className="text-xs text-gray-400">Every</span>
            <Select value={rule} onChange={e => setRule(e.target.value)} options={[
              { value: 'weekly', label: 'Week' }, { value: 'fortnightly', label: 'Fortnight' },
              { value: 'monthly', label: 'Month' }, { value: 'quarterly', label: 'Quarter' }, { value: 'yearly', label: 'Year' },
            ]} />
          </div>
          <div><span className="text-xs text-gray-400">Next issue</span><Input type="date" value={next} onChange={e => setNext(e.target.value)} /></div>
          <div><span className="text-xs text-gray-400">End (optional)</span><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
        </CardContent>
      )}
      <CardContent className="pt-0">
        <Button size="sm" loading={saving} onClick={save}>Save</Button>
        <p className="text-xs text-gray-400 mt-2">A draft copy with the same line items is created automatically each period (runs with the daily reminders job).</p>
      </CardContent>
    </Card>
  )
}
