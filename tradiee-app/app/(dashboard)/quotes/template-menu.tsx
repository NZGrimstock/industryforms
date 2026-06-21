'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, LayoutTemplate } from 'lucide-react'

export function TemplateMenu({ templates }: { templates: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false)
  if (templates.length === 0) return null
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <LayoutTemplate className="h-4 w-4" /> From template <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg">
          {templates.map(t => (
            <Link key={t.id} href={`/quotes/new?templateId=${t.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">{t.name}</Link>
          ))}
        </div>
      )}
    </div>
  )
}
