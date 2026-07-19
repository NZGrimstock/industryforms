'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { HelpCircle, X, Search, Camera, Lightbulb } from 'lucide-react'
import { HELP_GUIDE, type HelpSection } from './help-content'

// Renders **bold** markers in step text as <strong>.
function Bold({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**')
          ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

function matches(s: HelpSection, q: string) {
  const hay = [s.title, s.purpose, s.proTip, ...s.steps].join(' ').toLowerCase()
  return q.split(/\s+/).every(w => hay.includes(w))
}

// Floating Help button (bottom right) that opens a slide-in side panel. No
// backdrop — the app stays usable on the left while the guide is read on the
// right. Each section has an anchor id; opening the panel scrolls to the
// section matching the current route.
export function HelpPanel() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const pathname = usePathname()
  const bodyRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()

  // Best guide entry for the page currently on screen (longest href prefix wins).
  const currentId = useMemo(() => {
    let best: { id: string; len: number } | null = null
    for (const part of HELP_GUIDE) for (const g of part.groups) for (const s of g.sections) {
      if (s.href && pathname.startsWith(s.href) && (!best || s.href.length > best.len)) {
        best = { id: s.id, len: s.href.length }
      }
    }
    return best?.id ?? null
  }, [pathname])

  useEffect(() => {
    if (!open || q || !currentId) return
    const el = document.getElementById(`help-${currentId}`)
    if (el) {
      el.scrollIntoView({ block: 'start' })
      setFlash(currentId)
      const t = setTimeout(() => setFlash(null), 2000)
      return () => clearTimeout(t)
    }
  }, [open, currentId, q])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex items-center gap-2 rounded-full bg-[var(--accent,#f97316)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 print:hidden"
        aria-label="Open help guide"
      >
        <HelpCircle className="h-4 w-4" /> Help
      </button>
    )
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-2xl print:hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
        <HelpCircle className="h-4 w-4 text-[var(--accent,#f97316)]" />
        <h2 className="flex-1 text-sm font-semibold text-gray-900">Help Guide</h2>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:text-gray-700" aria-label="Close help">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search the guide…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Sections */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {HELP_GUIDE.map(part => {
          const groups = part.groups
            .map(g => ({ ...g, sections: q ? g.sections.filter(s => matches(s, q)) : g.sections }))
            .filter(g => g.sections.length > 0)
          if (groups.length === 0) return null
          return (
            <div key={part.id}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-900">{part.label}</h3>
              {groups.map(group => (
                <div key={group.label} className="mb-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{group.label}</p>
                  <div className="space-y-3">
                    {group.sections.map(s => (
                      <section
                        key={s.id}
                        id={`help-${s.id}`}
                        className={`scroll-mt-2 rounded-xl border p-3 transition-colors ${flash === s.id ? 'border-[var(--accent,#f97316)] bg-orange-50' : 'border-gray-100 bg-gray-50/50'}`}
                      >
                        <h4 className="text-sm font-semibold text-gray-900">{s.title}</h4>
                        <p className="mt-0.5 text-xs text-gray-600">{s.purpose}</p>
                        <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white px-2.5 py-2">
                          <Camera className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                          <p className="text-[11px] italic text-gray-400">[{s.screenshot}]</p>
                        </div>
                        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-gray-700 marker:text-gray-400">
                          {s.steps.map((step, i) => <li key={i}><Bold text={step} /></li>)}
                        </ol>
                        <blockquote className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
                          <span><span className="font-semibold">Pro-Tip:</span> {s.proTip}</span>
                        </blockquote>
                        {s.link && (
                          <a href={s.link.href} className="mt-2 inline-block text-xs font-medium text-[var(--accent,#f97316)] hover:underline">
                            {s.link.label}
                          </a>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
        {q && HELP_GUIDE.every(p => p.groups.every(g => g.sections.every(s => !matches(s, q)))) && (
          <p className="text-center text-sm text-gray-400">No results for “{query}”.</p>
        )}
      </div>
    </div>
  )
}
