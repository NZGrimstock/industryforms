import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'

export type PaymentTermsValue = {
  type: string // '' means "inherit the company default" — only meaningful when allowInherit
  days: string
  dayOfMonth: string
}

// Shared by Settings (company default) and the customer form (per-customer
// override) — drives invoices.due_date via the compute_invoice_due_date()
// trigger (20260816120000_payment_terms.sql).
export function PaymentTermsFields({ value, onChange, allowInherit }: {
  value: PaymentTermsValue
  onChange: (patch: Partial<PaymentTermsValue>) => void
  allowInherit?: boolean
}) {
  return (
    <div className="space-y-2">
      <Select
        value={value.type}
        onChange={e => onChange({ type: e.target.value })}
        options={[
          ...(allowInherit ? [{ value: '', label: 'Use company default' }] : []),
          { value: 'on_receipt', label: 'Due on receipt' },
          { value: 'net_days', label: 'Net days after invoice' },
          { value: 'day_of_month', label: 'Day of the following month' },
        ]}
      />
      {value.type === 'net_days' && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Due</span>
          <Input type="number" min="1" className="w-20" value={value.days} onChange={e => onChange({ days: e.target.value })} />
          <span>days after the invoice date (e.g. a &quot;7 day account&quot;)</span>
        </div>
      )}
      {value.type === 'day_of_month' && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Due on the</span>
          <Input type="number" min="1" max="31" className="w-16" value={value.dayOfMonth} onChange={e => onChange({ dayOfMonth: e.target.value })} />
          <span>of the month after the invoice date</span>
        </div>
      )}
    </div>
  )
}
