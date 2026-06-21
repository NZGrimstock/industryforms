'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Briefcase, Users, FileText, Receipt, CornerDownLeft } from 'lucide-react'
import type { SearchResult } from '@/app/api/search/route'

const ICONS = { job: Briefcase, customer: Users, quote: FileText, invoice: Receipt }

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Cmd/Ctrl+K toggles the palette anywhere in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else { setQ(''); setResults([]); setActive(0) }
  }, [open])

  // Debounced search.
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); setLoading(false); return }
    setLoading(true)
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const json = await res.json()
        setResults(json.results ?? [])
        setActive(0)
      } catch { /* aborted */ } finally { setLoading(false) }
    }, 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q])

  const go = useCallback((r: SearchResult) => {
    setOpen(false)
    router.push(r.href)
  }, [router])

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-gray-400 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg pl-2.5 pr-2 py-1.5 transition-colors w-44 sm:w-56"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search…</span>
        <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 text-[10px] text-gray-400 bg-white border border-gray-200 rounded px-1 py-0.5 font-sans">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-4 border-b border-gray-100">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search jobs, customers, quotes, invoices…"
                className="flex-1 py-3.5 text-sm outline-none placeholder:text-gray-400"
              />
              {loading && <span className="text-xs text-gray-400">…</span>}
            </div>
            <div className="max-h-[50vh] overflow-y-auto py-1.5">
              {q.trim().length >= 2 && !loading && results.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">No matches for “{q}”.</p>
              )}
              {q.trim().length < 2 && (
                <p className="px-4 py-6 text-sm text-gray-400 text-center">Type to search across your records.</p>
              )}
              {results.map((r, i) => {
                const Icon = ICONS[r.type]
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === active ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${i === active ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-900 truncate">{r.title}</span>
                      {r.subtitle && <span className="block text-xs text-gray-400 truncate">{r.subtitle}</span>}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-gray-300 shrink-0">{r.type}</span>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
