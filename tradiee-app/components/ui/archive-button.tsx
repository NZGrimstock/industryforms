'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive } from 'lucide-react'

interface Props {
  table: 'customers' | 'profiles'
  id: string
  label: string
  redirectTo?: string
  className?: string
  onArchived?: () => void
}

export function ArchiveButton({ table, id, label, redirectTo, className, onArchived }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function archive() {
    if (!confirm(`Archive this ${label}? It will be hidden from active lists but history stays intact.`)) return
    setLoading(true)
    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id }),
    })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? `Could not archive ${label}`)
      return
    }
    onArchived?.()
    if (redirectTo) router.push(redirectTo)
    else router.refresh()
  }

  return (
    <button
      type="button"
      onClick={archive}
      disabled={loading}
      className={className ?? 'p-1 text-gray-400 hover:text-amber-600 disabled:opacity-50'}
      title={`Archive ${label}`}
    >
      <Archive className="h-3.5 w-3.5" />
    </button>
  )
}
