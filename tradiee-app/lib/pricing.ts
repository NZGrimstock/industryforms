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

// Pre-tax net for a single line after its own discount. When `inclusive` is set
// the entered unit price already includes tax, so the tax portion is removed
// using the line's `taxRate` (fraction) to get the pre-tax net.
export function lineNet(
  quantity: number,
  unitPrice: number,
  type: DiscountType,
  value: number,
  taxRate = 0,
  inclusive = false,
): number {
  const gross = (Number(quantity) || 0) * (Number(unitPrice) || 0)
  const afterDiscount = gross - discountAmount(gross, type, value)
  return round2(inclusive ? afterDiscount / (1 + (Number(taxRate) || 0)) : afterDiscount)
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

// Roll up totals with a per-line tax rate (fraction). `net` is the line's
// pre-tax net (after any line discount). The document discount reduces the
// taxable base proportionally, so each line's tax is charged on its share of the
// discounted subtotal. Used for configurable / mixed-rate (GST-free) docs.
export function computeTaxedTotals(
  lines: { net: number; taxRate: number }[],
  docType: DiscountType,
  docValue: number,
) {
  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.net) || 0), 0))
  const discount = discountAmount(subtotal, docType, docValue)
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 1
  const gst = round2(lines.reduce((s, l) => s + (Number(l.net) || 0) * factor * (Number(l.taxRate) || 0), 0))
  const taxable = round2(subtotal - discount)
  const total = round2(taxable + gst)
  return { subtotal, discount, taxable, gst, total }
}

// Short human label for a discount, e.g. "10%" or "$50.00".
export function discountLabel(type: DiscountType, value: number): string {
  if (!type || !value) return ''
  return type === 'percent' ? `${value}%` : `$${round2(value).toFixed(2)}`
}
