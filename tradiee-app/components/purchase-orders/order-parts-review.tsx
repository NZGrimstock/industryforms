'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Send, Pencil, CheckCircle, AlertTriangle } from 'lucide-react'

type Item = { id: string; description: string; quantity: number; unit: string; unit_cost: number; line_total: number; price_list_item_id: string | null; sort_order: number }
export type PO = {
  id: string
  po_number: string
  status: string
  supplier_id: string | null
  total: number
  suppliers: { name: string; email: string | null } | null
  purchase_order_items: Item[]
}
type Supplier = { id: string; name: string; email: string | null }

export function OrderPartsReview({ pos: initialPos, suppliers }: { pos: PO[]; suppliers: Supplier[] }) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [pos, setPos] = useState(initialPos)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)

  if (pos.length === 0) {
    return <div className="p-6 text-sm text-gray-500">No purchase orders to review.</div>
  }

  // Assign a supplier to an unassigned PO, and remember it on the price-list items
  // so future quotes group automatically (the "learn once" behaviour).
  async function assignSupplier(po: PO, supplierId: string) {
    if (!supplierId) return
    const { error } = await supabase.from('purchase_orders').update({ supplier_id: supplierId }).eq('id', po.id)
    if (error) { toast(error.message, 'error'); return }
    const priceItemIds = po.purchase_order_items.map(i => i.price_list_item_id).filter((id): id is string => !!id)
    if (priceItemIds.length) {
      // best-effort: only fill items that don't already have a supplier
      await supabase.from('price_list_items').update({ supplier_id: supplierId }).in('id', priceItemIds).is('supplier_id', null)
    }
    const sup = suppliers.find(s => s.id === supplierId) ?? null
    setPos(prev => prev.map(p => p.id === po.id ? { ...p, supplier_id: supplierId, suppliers: sup ? { name: sup.name, email: sup.email } : null } : p))
    toast('Supplier assigned')
  }

  async function sendAll() {
    const unassigned = pos.find(p => !p.supplier_id)
    if (unassigned) { toast('Assign a supplier to every order first', 'error'); return }
    setSending(true)
    let ok = 0
    for (const po of pos) {
      if (sent[po.id]) { ok++; continue }
      if (!po.suppliers?.email) { toast(`${po.suppliers?.name ?? po.po_number} has no email — open the PO to send it another way`, 'error'); continue }
      const res = await fetch('/api/email/purchase-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId: po.id }),
      })
      if (res.ok) { setSent(prev => ({ ...prev, [po.id]: true })); ok++ }
      else { const d = await res.json().catch(() => ({})); toast(d.error ?? `Failed to send ${po.po_number}`, 'error') }
    }
    setSending(false)
    if (ok === pos.length) { toast('All orders sent'); router.push('/purchase-orders') }
  }

  const allAssigned = pos.every(p => p.supplier_id)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <p className="text-sm text-gray-600">
        {pos.length} purchase order{pos.length > 1 ? 's' : ''} ready from this quote{pos.length > 1 ? ', split by supplier' : ''}.
        Review below and send them all.
      </p>

      {pos.map(po => {
        const items = [...po.purchase_order_items].sort((a, b) => a.sort_order - b.sort_order)
        const isSent = sent[po.id]
        return (
          <Card key={po.id}>
            <CardHeader className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {isSent
                  ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                  : po.supplier_id ? null : <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />}
                <span className="font-semibold text-sm text-gray-900 truncate">
                  {po.suppliers?.name ?? 'Select a supplier'}
                </span>
                <span className="text-xs text-gray-400">{po.po_number}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!po.supplier_id && (
                  <Select
                    value=""
                    onChange={e => assignSupplier(po, e.target.value)}
                    placeholder="Assign supplier…"
                    options={suppliers.map(s => ({ value: s.id, label: s.name }))}
                    className="w-44"
                  />
                )}
                <Link href={`/purchase-orders/${po.id}`} className="p-1.5 text-gray-400 hover:text-gray-600" title="Edit order">
                  <Pencil className="h-4 w-4" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-1.5 pr-2 text-gray-700">{it.description}</td>
                      <td className="py-1.5 px-2 text-right text-gray-500 whitespace-nowrap">{Number(it.quantity)} {it.unit}</td>
                      <td className="py-1.5 pl-2 text-right text-gray-700 whitespace-nowrap">{formatCurrency(Number(it.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-right text-sm font-medium text-gray-900">Total {formatCurrency(Number(po.total))}</div>
              {po.supplier_id && !po.suppliers?.email && (
                <p className="mt-2 text-xs text-amber-600">This supplier has no email on file — open the order to send it another way.</p>
              )}
            </CardContent>
          </Card>
        )
      })}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => router.push('/purchase-orders')}>Save as drafts</Button>
        <Button loading={sending} disabled={!allAssigned} onClick={sendAll}>
          <Send className="h-4 w-4" /> Send all orders
        </Button>
      </div>
    </div>
  )
}
