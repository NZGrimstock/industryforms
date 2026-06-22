'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

export type RowAction = {
  label: string
  href?: string
  onClick?: () => void
  // Render the icon element on the caller side (e.g. <FileText className="h-4 w-4" />)
  // — passing a component function across the server→client boundary throws.
  icon?: React.ReactNode
  danger?: boolean
}

// `⋯` button that opens a small popover with row-level actions. Stops click
// propagation so it can live inside a clickable list row without triggering
// the row's primary link.
export function RowActions({ actions, label = 'Row actions' }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {actions.map((a, i) => {
            const cls = cn(
              'flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left',
              a.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'
            )
            const inner = <>{a.icon && <span className="text-gray-400 [&_svg]:h-4 [&_svg]:w-4">{a.icon}</span>} {a.label}</>
            if (a.href) {
              return (
                <Link key={i} href={a.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                  {inner}
                </Link>
              )
            }
            return (
              <button key={i} type="button" role="menuitem" className={cls}
                onClick={() => { setOpen(false); a.onClick?.() }}>
                {inner}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
