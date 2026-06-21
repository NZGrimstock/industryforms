'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, Star } from 'lucide-react'

// ── Payment methods ──────────────────────────────────────────────────────────
type PM = { id: string; name: string }

export function PaymentMethodsManager({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [rows, setRows] = useState<PM[]>([])
  const [name, setName] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('payment_methods').select('id, name').eq('company_id', companyId).order('sort_order')
    setRows((data ?? []) as PM[])
  }, [supabase, companyId])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!name.trim()) return
    const { error } = await supabase.from('payment_methods').insert({ company_id: companyId, name: name.trim(), sort_order: rows.length })
    if (error) { toast(error.message, 'error'); return }
    setName(''); load()
  }
  async function remove(id: string) { await supabase.from('payment_methods').delete().eq('id', id); load() }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">Payment methods</p>
      <p className="text-xs text-gray-400 mb-3">Shown when recording a payment on an invoice. Defaults (bank transfer, cash, card) apply if none are set.</p>
      <div className="space-y-2 mb-3">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-700">{r.name}</span>
            <button onClick={() => remove(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. EFTPOS, Direct debit" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <Button type="button" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
      </div>
    </div>
  )
}

// ── Billing rates ────────────────────────────────────────────────────────────
type BR = { id: string; name: string; rate: number; is_default: boolean }

export function BillingRatesManager({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [rows, setRows] = useState<BR[]>([])
  const [form, setForm] = useState({ name: '', rate: '' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('billing_rates').select('id, name, rate, is_default').eq('company_id', companyId).order('name')
    setRows((data ?? []) as BR[])
  }, [supabase, companyId])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!form.name.trim()) return
    const { error } = await supabase.from('billing_rates').insert({
      company_id: companyId, name: form.name.trim(), rate: parseFloat(form.rate) || 0, is_default: rows.length === 0,
    })
    if (error) { toast(error.message, 'error'); return }
    setForm({ name: '', rate: '' }); load()
  }
  async function remove(id: string) { await supabase.from('billing_rates').delete().eq('id', id); load() }
  async function makeDefault(id: string) {
    await supabase.from('billing_rates').update({ is_default: false }).eq('company_id', companyId)
    await supabase.from('billing_rates').update({ is_default: true }).eq('id', id)
    load()
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">Billing rates</p>
      <p className="text-xs text-gray-400 mb-3">Named hourly charge-out rates you can apply to labour lines on quotes.</p>
      <div className="space-y-2 mb-3">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-700">{r.name} — ${Number(r.rate).toFixed(2)}/hr {r.is_default && <span className="ml-1 text-xs text-orange-600">(default)</span>}</span>
            <div className="flex items-center gap-2">
              {!r.is_default && <button onClick={() => makeDefault(r.id)} className="text-gray-300 hover:text-orange-500" title="Make default"><Star className="h-4 w-4" /></button>}
              <button onClick={() => remove(r.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Rate name (e.g. Standard)" />
        <Input type="number" step="0.01" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="$/hr" className="w-28" />
        <Button type="button" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add</Button>
      </div>
    </div>
  )
}
