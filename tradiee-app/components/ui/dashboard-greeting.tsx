'use client'
import { useEffect, useState } from 'react'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

export function DashboardGreeting({ firstName }: { firstName: string }) {
  const [greeting, setGreeting] = useState('')
  // Deliberately an effect, not a lazy useState initializer: getGreeting()
  // depends on the browser's local hour, which can differ from the server's
  // during SSR. Computing it eagerly would render a value on the server that
  // mismatches the client on hydration; deferring to an effect renders
  // nothing until the client has mounted and can compute its own local time.
  useEffect(() => { setGreeting(getGreeting()) }, [])
  if (!greeting) return null
  return (
    <p className="text-xl font-semibold text-gray-900">
      Good {greeting}, {firstName}! 👋
    </p>
  )
}
