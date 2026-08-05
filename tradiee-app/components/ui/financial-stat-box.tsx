import { formatCurrency } from '@/lib/utils'

export type FinancialStat = { label: string; value: number; accent?: 'neutral' | 'warn' | 'good' }

const ACCENT_CLASS: Record<NonNullable<FinancialStat['accent']>, string> = {
  neutral: 'text-gray-900',
  warn: 'text-amber-600',
  good: 'text-green-600',
}

// Thin stat strip used on the customer and job detail pages. `orientation`
// switches between a horizontal bar (customer page, full width) and a
// vertical stack (job page, sits in a right-hand column).
export function FinancialStatBox({ stats, orientation = 'row', currency = 'NZD' }: {
  stats: FinancialStat[]
  orientation?: 'row' | 'column'
  currency?: string
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white divide-gray-100 ${orientation === 'row' ? 'flex divide-x' : 'flex flex-col divide-y'}`}>
      {stats.map(s => (
        <div key={s.label} className={orientation === 'row' ? 'flex-1 px-4 py-3 text-center' : 'px-4 py-3'}>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
          <p className={`mt-0.5 text-lg font-semibold ${ACCENT_CLASS[s.accent ?? 'neutral']}`}>{formatCurrency(s.value, currency)}</p>
        </div>
      ))}
    </div>
  )
}
