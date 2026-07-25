'use client'
import { createContext, useContext, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { discountLabel, type DiscountType } from '@/lib/pricing'

// The invoice line table used to render server-side, so every "add line" had to
// round-trip through router.refresh() before you saw anything. It now lives in
// client state shared with the action buttons, so adds/removes paint instantly;
// a background router.refresh() still runs to reconcile with the DB (same
// pattern as jobs/[id]/materials.tsx).

export type InvoiceLine = {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_type: DiscountType
  discount_value: number
  line_total: number
  sort_order: number
}

export type InvoiceTotals = {
  subtotal: number
  discount_amount: number
  discount_type: DiscountType
  discount_value: number
  gst_amount: number
  total: number
  amount_paid: number
}

type Ctx = {
  lines: InvoiceLine[]
  totals: InvoiceTotals
  addLines: (rows: InvoiceLine[]) => void
  removeLine: (id: string) => void
  applyTotals: (t: Partial<InvoiceTotals>) => void
}

const InvoiceLinesCtx = createContext<Ctx | null>(null)

export function useInvoiceLines(): Ctx {
  const ctx = useContext(InvoiceLinesCtx)
  if (!ctx) throw new Error('useInvoiceLines must be used inside InvoiceLinesProvider')
  return ctx
}

export function InvoiceLinesProvider({ initialLines, initialTotals, children }: {
  initialLines: InvoiceLine[]
  initialTotals: InvoiceTotals
  children: React.ReactNode
}) {
  const [lines, setLines] = useState(initialLines)
  const [totals, setTotals] = useState(initialTotals)

  // Server refresh landed — take it as the source of truth over our optimistic
  // guess. Compared by value, not identity: page.tsx builds initialTotals inline
  // so its object identity changes every render. Adjusting state during render
  // (rather than in an effect) is React's documented pattern for resetting on a
  // prop change and avoids the extra render pass.
  const serverSig = JSON.stringify([initialLines.map(l => [l.id, l.line_total]), initialTotals])
  const [sig, setSig] = useState(serverSig)
  if (sig !== serverSig) {
    setSig(serverSig)
    setLines(initialLines)
    setTotals(initialTotals)
  }

  return (
    <InvoiceLinesCtx.Provider value={{
      lines,
      totals,
      addLines: rows => setLines(prev => [...prev, ...rows]),
      removeLine: id => setLines(prev => prev.filter(l => l.id !== id)),
      applyTotals: t => setTotals(prev => ({ ...prev, ...t })),
    }}>
      {children}
    </InvoiceLinesCtx.Provider>
  )
}

export function InvoiceLinesCard() {
  const { lines, totals } = useInvoiceLines()
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order)

  if (sorted.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="py-8 text-center text-sm text-gray-400">No line items — add them below</CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-400">
            <th className="text-left px-6 py-2 font-medium">Description</th>
            <th className="text-right px-3 py-2 font-medium w-20">Qty</th>
            <th className="text-right px-3 py-2 font-medium w-28">Unit price</th>
            <th className="text-right px-3 py-2 font-medium w-20">Disc.</th>
            <th className="text-right px-6 py-2 font-medium w-28">Total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(l => (
            <tr key={l.id} className="border-b border-gray-50 last:border-0">
              <td className="px-6 py-3 text-gray-700">{l.description}</td>
              <td className="px-3 py-3 text-right text-gray-500">{l.quantity} {l.unit}</td>
              <td className="px-3 py-3 text-right text-gray-500">{formatCurrency(l.unit_price)}</td>
              <td className="px-3 py-3 text-right text-gray-400">{discountLabel(l.discount_type, Number(l.discount_value)) || '—'}</td>
              <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(l.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t border-gray-100">
          <tr>
            <td colSpan={4} className="px-6 py-3 text-right text-sm text-gray-600">Subtotal</td>
            <td className="px-6 py-3 text-right text-sm font-medium text-gray-900">{formatCurrency(totals.subtotal)}</td>
          </tr>
          {Number(totals.discount_amount) > 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-2 text-right text-sm text-green-600">Discount{totals.discount_type === 'percent' ? ` (${Number(totals.discount_value)}%)` : ''}</td>
              <td className="px-6 py-2 text-right text-sm text-green-600">−{formatCurrency(totals.discount_amount)}</td>
            </tr>
          )}
          <tr>
            <td colSpan={4} className="px-6 py-2 text-right text-sm text-gray-600">GST</td>
            <td className="px-6 py-2 text-right text-sm font-medium text-gray-900">{formatCurrency(totals.gst_amount)}</td>
          </tr>
          <tr className="border-t border-gray-200">
            <td colSpan={4} className="px-6 py-3 text-right font-semibold text-gray-900">Total</td>
            <td className="px-6 py-3 text-right font-bold text-gray-900 text-base">{formatCurrency(totals.total)}</td>
          </tr>
          {totals.amount_paid > 0 && (
            <>
              <tr>
                <td colSpan={4} className="px-6 py-2 text-right text-sm text-green-600">Paid</td>
                <td className="px-6 py-2 text-right text-sm text-green-600">-{formatCurrency(totals.amount_paid)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="px-6 py-2 text-right font-semibold text-gray-900">Balance due</td>
                <td className="px-6 py-2 text-right font-bold text-gray-900">{formatCurrency(totals.total - totals.amount_paid)}</td>
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </Card>
  )
}
