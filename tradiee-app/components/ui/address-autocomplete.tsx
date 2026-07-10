'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (address: string) => void
  /** Fires when a suggestion is picked, with the geocoded coordinates. */
  onSelect?: (sel: { address: string; lat: number | null; lng: number | null }) => void
  placeholder?: string
  required?: boolean
  className?: string
  id?: string
}

const API_KEY = process.env.NEXT_PUBLIC_LOCATIONIQ_KEY

type Suggestion = { place_id: string; display_name: string; lat?: string; lon?: string }

// LocationIQ returns "123, Any Street, …" — strip the comma after the house number
function cleanAddress(s: string) {
  return s.replace(/^(\d+[a-zA-Z]?),\s+/, '$1 ')
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Start typing an address…',
  required,
  className,
  id,
}: Props) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleChange(text: string) {
    setQuery(text)
    onChange(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!text.trim() || !API_KEY) {
      setSuggestions([])
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.locationiq.com/v1/autocomplete?key=${API_KEY}&q=${encodeURIComponent(text)}&limit=5&countrycodes=nz,au&dedupe=1&format=json`
        )
        if (!res.ok) return
        const data: Suggestion[] = await res.json()
        setSuggestions(data)
        setOpen(data.length > 0)
      } catch {
        // silently ignore network errors
      }
    }, 350)
  }

  function select(s: Suggestion) {
    const addr = cleanAddress(s.display_name)
    setQuery(addr)
    onChange(addr)
    onSelect?.({
      address: addr,
      lat: s.lat ? parseFloat(s.lat) : null,
      lng: s.lon ? parseFloat(s.lon) : null,
    })
    setSuggestions([])
    setOpen(false)
  }

  const baseClass = `w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent,#f97316)] ${className ?? ''}`

  if (!API_KEY) {
    return (
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={baseClass}
      />
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        placeholder={placeholder}
        required={required}
        className={baseClass}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.place_id}
              type="button"
              onClick={() => select(s)}
              className={`w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors ${i < suggestions.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              {cleanAddress(s.display_name)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
