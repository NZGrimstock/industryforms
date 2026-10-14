'use client'
import { createContext, useContext, useRef, useState } from 'react'
import type { DiscountType } from '@/lib/pricing'

// The invoice line table used to render server-side, so every "add line" had to
// round-trip through router.refresh() before you saw anything. It now lives in
// client state shared with the action buttons, so adds/removes paint instantly;
// a background router.refresh() still runs to reconcile with the DB (same
// pattern as jobs/[id]/materials.tsx). The paper table that renders these
// lines (and edits them while draft) is components/invoices/invoice-paper-lines.tsx.

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
  type?: string | null
  tax_rate?: number | null
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
  /** Local edit (paper editor). Marks the line dirty unless only line_total changes. */
  updateLine: (id: string, patch: Partial<InvoiceLine>) => void
  /** The line's edits are saved — server refreshes may overwrite it again. */
  markClean: (id: string) => void
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
  // Lines with unsaved in-place edits (paper editor). A refresh triggered by
  // saving one row must not wipe what's being typed into another.
  const dirty = useRef(new Set<string>())
  if (sig !== serverSig) {
    setSig(serverSig)
    setLines(prev => initialLines.map(server => {
      if (!dirty.current.has(server.id)) return server
      const local = prev.find(p => p.id === server.id)
      return local ? { ...server, description: local.description, quantity: local.quantity, unit: local.unit, unit_price: local.unit_price } : server
    }))
    setTotals(initialTotals)
  }

  return (
    <InvoiceLinesCtx.Provider value={{
      lines,
      totals,
      addLines: rows => setLines(prev => [...prev, ...rows]),
      removeLine: id => setLines(prev => prev.filter(l => l.id !== id)),
      updateLine: (id, patch) => {
        if (Object.keys(patch).some(k => k !== 'line_total')) dirty.current.add(id)
        setLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
      },
      markClean: id => { dirty.current.delete(id) },
      applyTotals: t => setTotals(prev => ({ ...prev, ...t })),
    }}>
      {children}
    </InvoiceLinesCtx.Provider>
  )
}
