'use client'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// Clickable column header that toggles ?sort=&dir= while preserving the other
// query params (status, q). Keeps list sorting server-rendered.
export function SortHeader({ label, column, basePath, params, sort, dir, align = 'left' }: {
  label: string
  column: string
  basePath: string
  params: Record<string, string>
  sort?: string
  dir?: string
  align?: 'left' | 'right'
}) {
  const router = useRouter()
  const active = sort === column
  const nextDir = active && dir === 'asc' ? 'desc' : 'asc'

  function go() {
    const p = new URLSearchParams(params)
    p.set('sort', column)
    p.set('dir', nextDir)
    router.push(`${basePath}?${p.toString()}`)
  }

  return (
    <button onClick={go} className={`inline-flex items-center gap-1 hover:text-gray-700 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {label}
      {active
        ? (dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)
        : <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" />}
    </button>
  )
}
