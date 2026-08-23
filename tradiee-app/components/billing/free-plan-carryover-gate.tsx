'use client'
// Blocking overlay for a free-plan company sitting over the free-tier
// customer/stock-item caps — e.g. imported 1000 customers during trial, then
// the trial lapsed to free (cap 10). enforce_plan_row_cap() only ever blocked
// a *new* row, so without this, all 1000 stay fully usable forever. Owner/
// admin picks which ones to keep active; the rest are archived (not
// deleted — see the API route). Self-resolving: once active counts are back
// within the caps, the mount-time check below finds nothing over cap and
// renders null, no persisted "reviewed" flag needed, so it also re-triggers
// correctly if the company upgrades, adds more, then drops to free again
// later.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

const CUSTOMER_CAP = 10
const STOCK_CAP = 50

type CustomerRow = { id: string; name: string; email: string | null; phone: string | null }
type StockRow = { id: string; name: string; sell_price: number | null }

export function FreePlanCarryoverGate({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerRow[] | null>(null)
  const [stock, setStock] = useState<StockRow[] | null>(null)
  const [keepCustomers, setKeepCustomers] = useState<Set<string>>(new Set())
  const [keepStock, setKeepStock] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [custRes, stockRes] = await Promise.all([
        supabase.from('customers').select('id, name, email, phone').eq('company_id', companyId).eq('is_active', true).order('name'),
        supabase.from('price_list_items').select('id, name, sell_price').eq('company_id', companyId).eq('is_active', true).order('name'),
      ])
      if (cancelled) return
      const custOver = (custRes.data ?? []).length > CUSTOMER_CAP
      const stockOver = (stockRes.data ?? []).length > STOCK_CAP
      if (custOver) setCustomers(custRes.data as CustomerRow[])
      if (stockOver) setStock(stockRes.data as StockRow[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [companyId, supabase])

  function toggleCustomer(id: string) {
    setKeepCustomers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < CUSTOMER_CAP) next.add(id)
      return next
    })
  }
  function toggleStock(id: string) {
    setKeepStock(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < STOCK_CAP) next.add(id)
      return next
    })
  }

  async function submit() {
    setSaving(true)
    const res = await fetch('/api/billing/free-plan-carryover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keepCustomerIds: customers ? [...keepCustomers] : undefined,
        keepStockItemIds: stock ? [...keepStock] : undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast(data.error ?? 'Could not save your choices', 'error')
      return
    }
    toast('Saved — the rest have been archived, not deleted. You can restore any of them if you upgrade.')
    router.refresh()
  }

  if (loading || (!customers && !stock)) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl my-8">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Your free plan is capped at {customers ? `${CUSTOMER_CAP} customers` : ''}{customers && stock ? ' and ' : ''}{stock ? `${STOCK_CAP} stock items` : ''}</h2>
        <p className="mb-6 text-sm text-gray-600">
          You have more than that saved already. Nothing is deleted — pick which ones stay active and usable now; the rest are archived and come straight back if you upgrade.
        </p>

        {customers && (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Customers to keep</h3>
              <span className={`text-xs font-medium ${keepCustomers.size === CUSTOMER_CAP ? 'text-green-600' : 'text-gray-400'}`}>{keepCustomers.size} / {CUSTOMER_CAP}</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {customers.map(c => {
                const checked = keepCustomers.has(c.id)
                const disabled = !checked && keepCustomers.size >= CUSTOMER_CAP
                return (
                  <label key={c.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleCustomer(c.id)} className="rounded" />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-gray-400 truncate">{c.email ?? c.phone ?? ''}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {stock && (
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Stock items to keep</h3>
              <span className={`text-xs font-medium ${keepStock.size === STOCK_CAP ? 'text-green-600' : 'text-gray-400'}`}>{keepStock.size} / {STOCK_CAP}</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
              {stock.map(s => {
                const checked = keepStock.has(s.id)
                const disabled = !checked && keepStock.size >= STOCK_CAP
                return (
                  <label key={s.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${disabled ? 'opacity-40' : 'cursor-pointer hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleStock(s.id)} className="rounded" />
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="text-xs text-gray-400">{s.sell_price != null ? `$${Number(s.sell_price).toFixed(2)}` : ''}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        <p className="mb-3 text-xs text-gray-400">You can keep fewer than the cap if you&apos;d rather — just tick the ones you want.</p>
        <Button onClick={submit} loading={saving} className="w-full justify-center">Save and continue</Button>
      </div>
    </div>
  )
}
