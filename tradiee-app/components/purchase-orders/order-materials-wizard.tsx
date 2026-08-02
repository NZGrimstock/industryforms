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
import { Send, Pencil, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react'

type Item = { id: string; description: string; quantity: number; unit: string; line_total: number; price_list_item_id: string | null; sort_order: number }
export type WizardPO = {
  id: string
  po_number: string
  supplier_id: string | null
  total: number
  reference: string | null
  suppliers: { name: string; email: string | null } | null
  purchase_order_items: Item[]
}
type Supplier = { id: string; name: string; email: string | null }

// Steps through the POs generated from a job one at a time — assign a supplier
// if needed, then send. Materials without a supplier are grouped into a final
// "unassigned" PO; assigning one here also remembers it on the price-list item
// so the next job groups automatically.
export function OrderMaterialsWizard({ pos: initialPos, suppliers, jobId, jobNumber }: {
  pos: WizardPO[]
  suppliers: Supplier[]
  jobId: string
  jobNumber: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [pos, setPos] = useState(initialPos)
  const [step, setStep] = useState(0)
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  if (pos.length === 0) {
    return <div className="p-6 text-sm text-gray-500">No purchase orders to review.</div>
  }

  const po = pos[step]
  const isLast = step === pos.length - 1
  const items = [...po.purchase_order_items].sort((a, b) => a.sort_order - b.sort_order)

  async function assignSupplier(supplierId: string) {
    if (!supplierId) return
    const { error } = await supabase.from('purchase_orders').update({ supplier_id: supplierId }).eq('id', po.id)
    if (error) { toast(error.message, 'error'); return }
    const priceItemIds = po.purchase_order_items.map(i => i.price_list_item_id).filter((v): v is string => !!v)
    if (priceItemIds.length) {
      // Remember for next time — only fills items that don't already have one.
      await supabase.from('price_list_items').update({ supplier_id: supplierId }).in('id', priceItemIds).is('supplier_id', null)
    }
    const sup = suppliers.find(s => s.id === supplierId) ?? null
    setPos(prev => prev.map(p => p.id === po.id
      ? { ...p, supplier_id: supplierId, suppliers: sup ? { name: sup.name, email: sup.email } : null }
      : p))
    toast('Supplier assigned')
  }

  function advance() {
    if (isLast) { toast('All purchase orders done'); router.push(`/jobs/${jobId}`); router.refresh() }
    else setStep(s => s + 1)
  }

  async function sendAndNext() {
    if (!po.supplier_id) { toast('Assign a supplier first', 'error'); return }
    if (!po.suppliers?.email) { toast('This supplier has no email — open the order to send it another way', 'error'); return }
    setBusy(true)
    const res = await fetch('/api/email/purchase-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poId: po.id }),
    })
    setBusy(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast(d.error ?? `Failed to send ${po.po_number}`, 'error')
      return
    }
    setSent(prev => ({ ...prev, [po.id]: true }))
    toast(`${po.po_number} sent`)
    advance()
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Purchase order <strong>{step + 1}</strong> of <strong>{pos.length}</strong> for job {jobNumber}
        </p>
        <div className="flex gap-1">
          {pos.map((p, i) => (
            <span key={p.id} className={`h-1.5 w-6 rounded-full ${i < step || sent[p.id] ? 'bg-green-500' : i === step ? 'bg-[var(--accent,#f97316)]' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {sent[po.id]
              ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              : !po.supplier_id ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /> : null}
            <span className="font-semibold text-sm text-gray-900 truncate">{po.suppliers?.name ?? 'Select a supplier'}</span>
            <span className="text-xs text-gray-400">{po.po_number}</span>
          </div>
          <Link href={`/purchase-orders/${po.id}`} className="p-1.5 text-gray-400 hover:text-gray-600" title="Edit order">
            <Pencil className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {!po.supplier_id && (
            <div className="mb-3">
              <Select
                value=""
                onChange={e => assignSupplier(e.target.value)}
                placeholder="Assign supplier…"
                options={suppliers.map(s => ({ value: s.id, label: s.name }))}
              />
              <p className="mt-1 text-xs text-gray-400">These materials have no supplier set. Choosing one here remembers it for next time.</p>
            </div>
          )}
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
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-gray-400">Ref {po.reference ?? jobNumber}</span>
            <span className="font-medium text-gray-900">Total {formatCurrency(Number(po.total))}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between gap-2 pt-1">
        <Button variant="outline" onClick={() => router.push(`/jobs/${jobId}`)}>Save as drafts &amp; close</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={advance}>
            {isLast ? 'Finish' : 'Skip'} {!isLast && <ArrowRight className="h-4 w-4" />}
          </Button>
          <Button loading={busy} disabled={!po.supplier_id || sent[po.id]} onClick={sendAndNext}>
            <Send className="h-4 w-4" /> {sent[po.id] ? 'Sent' : isLast ? 'Send & finish' : 'Send & next'}
          </Button>
        </div>
      </div>
    </div>
  )
}
