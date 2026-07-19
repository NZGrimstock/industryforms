'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { HelpCircle, X, Search, Camera, Lightbulb, MessageSquareText, BookOpen, Sparkles, Send, Loader2 } from 'lucide-react'
import { HELP_GUIDE, HELP_SCREENSHOTS, type HelpSection } from './help-content'

const FEEDBACK_MAILTO =
  'mailto:support@industryforms.app?subject=IndustryForms%20feedback&body=Tell%20us%20what%20you%20love%2C%20what%27s%20confusing%2C%20or%20what%20you%27d%20like%20to%20see%3A%0A%0A'

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

type Msg = { role: 'user' | 'assistant'; text: string }

// Floating Help button (bottom right) that opens a slide-in side panel. No
// backdrop — the app stays usable on the left while the guide is read on the
// right. Two views share the one panel: "Guide" (searchable screen-by-screen
// walkthrough, auto-scrolled to the page you're on) and "Ask AI" (the assistant
// that used to live in its own floating button). One button, not two.
export function HelpPanel() {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'guide' | 'ai'>('guide')
  const [query, setQuery] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const pathname = usePathname()

  // AI chat state.
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

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
    if (!open || view !== 'guide' || q || !currentId) return
    const el = document.getElementById(`help-${currentId}`)
    if (el) {
      el.scrollIntoView({ block: 'start' })
      setFlash(currentId)
      const t = setTimeout(() => setFlash(null), 2000)
      return () => clearTimeout(t)
    }
  }, [open, view, currentId, q])

  useEffect(() => {
    if (view === 'ai') chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, view])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text }])
    setLoading(true)
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: msgs.slice(-8) }),
      })
      const data = await res.json() as { reply?: string; error?: string }
      setMsgs(m => [...m, { role: 'assistant', text: data.reply ?? data.error ?? 'Sorry, something went wrong.' }])
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: 'Failed to reach the assistant. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex items-center gap-2 rounded-full bg-[var(--accent,#f97316)] px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:opacity-90 print:hidden"
        aria-label="Open help"
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
        <h2 className="flex-1 text-sm font-semibold text-gray-900">Help</h2>
        <a
          href={FEEDBACK_MAILTO}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          title="Email us feedback"
        >
          <MessageSquareText className="h-3.5 w-3.5" /> Feedback
        </a>
        <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:text-gray-700" aria-label="Close help">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 border-b border-gray-100 p-2">
        <button
          onClick={() => setView('guide')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'guide' ? 'bg-[var(--accent,#f97316)] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <BookOpen className="h-3.5 w-3.5" /> Guide
        </button>
        <button
          onClick={() => setView('ai')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${view === 'ai' ? 'bg-[var(--accent,#f97316)] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Ask AI
        </button>
      </div>

      {view === 'guide' ? (
        <>
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
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
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
                            {HELP_SCREENSHOTS.has(s.id) ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/help/${s.id}.webp`}
                                alt={s.screenshot}
                                loading="lazy"
                                className="mt-2 w-full rounded-lg border border-gray-200"
                              />
                            ) : (
                              <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-white px-2.5 py-2">
                                <Camera className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                                <p className="text-[11px] italic text-gray-400">[{s.screenshot}]</p>
                              </div>
                            )}
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
        </>
      ) : (
        /* AI chat */
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.length === 0 && (
              <p className="mt-4 text-center text-xs text-gray-400">
                Ask me anything about IndustryForms — e.g. <em>“How do I send an invoice?”</em>
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-xs ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-[var(--accent,#f97316)] text-white'
                      : 'rounded-bl-sm bg-gray-100 text-gray-800'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl rounded-bl-sm bg-gray-100 px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="flex gap-2 border-t border-gray-100 p-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask anything…"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--accent,#f97316)]"
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-[var(--accent,#f97316)] p-2 text-white transition-colors disabled:opacity-40"
              aria-label="Send"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
