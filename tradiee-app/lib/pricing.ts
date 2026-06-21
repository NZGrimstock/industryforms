// Shared discount + totals math for quotes and invoices.
// Discounts can be a fixed dollar amount ('amount') or a percentage ('percent').

export type DiscountType = 'amount' | 'percent' | null | undefined

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// $ value of a discount applied to `base`, clamped to [0, base].
export function discountAmount(base: number, type: DiscountType, value: number): number {
  if (!type || !value || base <= 0) return 0
  const raw = type === 'percent' ? (base * value) / 100 : value
  return round2(Math.min(Math.max(raw, 0), base))
}

// Net total for a single line after its own discount.
export function lineNet(quantity: number, unitPrice: number, type: DiscountType, value: number): number {
  const gross = (Number(quantity) || 0) * (Number(unitPrice) || 0)
  return round2(gross - discountAmount(gross, type, value))
}

// Roll up document totals. `lineNets` are already net of per-line discounts.
export function computeTotals(
  lineNets: number[],
  docType: DiscountType,
  docValue: number,
  gstRate: number,
) {
  const subtotal = round2(lineNets.reduce((s, n) => s + (Number(n) || 0), 0))
  const discount = discountAmount(subtotal, docType, docValue)
  const taxable = round2(subtotal - discount)
  const gst = round2(taxable * gstRate)
  const total = round2(taxable + gst)
  return { subtotal, discount, taxable, gst, total }
}

// Short human label for a discount, e.g. "10%" or "$50.00".
export function discountLabel(type: DiscountType, value: number): string {
  if (!type || !value) return ''
  return type === 'percent' ? `${value}%` : `$${round2(value).toFixed(2)}`
}
