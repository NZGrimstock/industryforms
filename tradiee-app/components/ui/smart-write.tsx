'use client'
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

interface SmartWriteProps {
  value: string
  onChange: (improved: string) => void
  placeholder?: string
}

export function SmartWriteButton({ value, onChange, placeholder }: SmartWriteProps) {
  const [loading, setLoading] = useState(false)

  async function improve() {
    const text = value.trim()
    if (!text || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/voice/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, mode: 'description' }),
      })
      const data = await res.json()
      if (data.improved) onChange(data.improved)
    } catch {
      // silently fail — don't disrupt the user
    }
    setLoading(false)
  }

  return (
    <button
      type="button"
      onClick={improve}
      disabled={!value.trim() || loading}
      title={placeholder ?? 'Improve with AI'}
      className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-[var(--accent,#f97316)] disabled:opacity-30 disabled:cursor-default transition-colors"
    >
      {loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : <Sparkles className="h-3.5 w-3.5" />
      }
      {loading ? 'Improving…' : 'SmartWrite'}
    </button>
  )
}
