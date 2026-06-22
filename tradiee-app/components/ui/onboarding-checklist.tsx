import Link from 'next/link'
import { Check, Circle, Rocket } from 'lucide-react'

export type OnboardingStep = { label: string; done: boolean; href: string }

// "Get up and running" checklist (Tradify-style). Auto-hides once every step is
// complete, so it only nudges new accounts.
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const doneCount = steps.filter(s => s.done).length
  if (doneCount === steps.length) return null

  const pct = Math.round((doneCount / steps.length) * 100)

  return (
    <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent,#f97316)] flex items-center justify-center">
            <Rocket className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Get up and running</h3>
            <p className="text-xs text-gray-500">{doneCount} of {steps.length} done</p>
          </div>
        </div>
        <div className="w-28 h-1.5 rounded-full bg-orange-100 overflow-hidden">
          <div className="h-full bg-[var(--accent,#f97316)] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {steps.map(s => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${s.done ? 'text-gray-400' : 'text-gray-700 hover:bg-orange-50'}`}
            >
              {s.done
                ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 shrink-0"><Check className="h-3 w-3 text-white" /></span>
                : <Circle className="h-5 w-5 text-orange-300 shrink-0" />}
              <span className={s.done ? 'line-through' : 'font-medium'}>{s.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
