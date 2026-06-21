'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'

// Lightweight search box for list pages. Navigates with ?q= (preserving the
// active ?status= tab) so filtering stays server-rendered.
export function ListSearch({ placeholder, basePath, status, defaultValue }: {
  placeholder: string
  basePath: string
  status?: string
  defaultValue?: string
}) {
  const router = useRouter()
  const [value, setValue] = useState(defaultValue ?? '')

  function go(q: string) {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (q.trim()) params.set('q', q.trim())
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  return (
    <form
      onSubmit={e => { e.preventDefault(); go(value) }}
      className="relative mb-4 max-w-md"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 pl-9 pr-9 py-2 text-sm focus:outline-none focus:border-orange-400"
      />
      {value && (
        <button type="button" onClick={() => { setValue(''); go('') }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  )
}
