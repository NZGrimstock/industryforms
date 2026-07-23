'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Labeled dropdown button + menu. Trigger shows a label; the panel holds
// arbitrary content (DropdownItem rows, or richer controls like tickboxes / a
// percentage box that shouldn't auto-close). Closes on outside-click / Escape.
const CloseCtx = createContext<() => void>(() => {})
export function useDropdownClose() { return useContext(CloseCtx) }

export function Dropdown({
  label, icon, variant = 'outline', align = 'left', panelClassName, disabled, children,
}: {
  label: React.ReactNode
  icon?: React.ReactNode
  variant?: 'outline' | 'primary'
  align?: 'left' | 'right'
  panelClassName?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onEsc) }
  }, [open])

  const triggerCls = cn(
    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-50',
    variant === 'primary'
      ? 'bg-green-600 hover:bg-green-700 text-white'
      : 'border border-gray-200 hover:bg-gray-50 text-gray-700',
  )

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(v => !v)} className={triggerCls}>
        {icon}{label}<ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open && (
        <div role="menu" className={cn('absolute z-30 mt-1 min-w-[13rem] rounded-lg border border-gray-200 bg-white shadow-lg py-1', align === 'right' ? 'right-0' : 'left-0', panelClassName)}>
          <CloseCtx.Provider value={() => setOpen(false)}>{children}</CloseCtx.Provider>
        </div>
      )}
    </div>
  )
}

// A simple clickable menu row that closes the dropdown after firing.
export function DropdownItem({ onClick, icon, danger, disabled, children }: {
  onClick?: () => void
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  const close = useDropdownClose()
  return (
    <button
      type="button" role="menuitem" disabled={disabled}
      onClick={() => { close(); onClick?.() }}
      className={cn('flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left disabled:opacity-50',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50')}
    >
      {icon && <span className="text-gray-400 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}{children}
    </button>
  )
}
