import Link from 'next/link'
import { Sparkles } from 'lucide-react'

// Thin and permanent — no dismiss. The benefit line rotates by day of month
// (not a timer), so it varies without being an in-page motion/carousel nag —
// same reasoning as before, just without a way to make it disappear.
const BENEFITS = [
  'Never miss out on a job or payment with automatic invoice and quote chasing',
  'Never forget how long you spent on that job with automatic time logging',
  'Draft quotes in seconds with AI',
  'Auto-generate purchase orders from your quotes',
  'Sync invoices straight to Xero',
  'Take card payments in person with Tap to Pay',
]

export function FreeTierBanner() {
  const benefit = BENEFITS[new Date().getDate() % BENEFITS.length]

  return (
    <div className="flex items-center gap-3 bg-orange-50 border-b border-orange-100 px-4 py-2 text-sm text-orange-900">
      <Sparkles className="h-4 w-4 text-orange-500 shrink-0" />
      <span className="flex-1 min-w-0 truncate">
        <span className="font-semibold">Free Version</span> · free forever — {benefit}
      </span>
      <Link href="/upgrade" className="shrink-0 font-medium text-orange-600 hover:text-orange-700 hover:underline">
        Upgrade
      </Link>
    </div>
  )
}
