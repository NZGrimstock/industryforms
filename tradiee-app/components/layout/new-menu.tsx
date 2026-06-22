'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Briefcase, FileText, Users, MessageSquare, FolderKanban } from 'lucide-react'

type Item = { label: string; href: string; icon: typeof Plus; staff?: boolean }

const ITEMS: Item[] = [
  { label: 'New job', href: '/jobs?newJob=1', icon: Briefcase, staff: true },
  { label: 'New project', href: '/projects', icon: FolderKanban },
  { label: 'New quote', href: '/quotes/new', icon: FileText },
  { label: 'New customer', href: '/customers/new', icon: Users },
  { label: 'New enquiry', href: '/enquiries?new=1', icon: MessageSquare },
]

export function NewMenu({ isStaff = false }: { isStaff?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const items = isStaff ? ITEMS.filter(i => i.staff) : ITEMS

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 bg-[var(--brand,#f97316)] hover:bg-[var(--brand-hover,#ea580c)] text-white text-sm font-medium pl-2.5 pr-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus className="h-4 w-4" /> New
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-48 bg-white border border-gray-100 rounded-xl shadow-lg py-1.5 z-50">
          {items.map(({ label, href, icon: Icon }) => (
            <button
              key={href}
              onClick={() => { setOpen(false); router.push(href) }}
              className="w-full flex items-center gap-3 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
            >
              <Icon className="h-4 w-4 text-gray-400" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
