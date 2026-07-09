'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'

const TimezoneContext = createContext<string>(DEFAULT_TIMEZONE)

export function TimezoneProvider({ timezone, children }: { timezone: string | null | undefined; children: React.ReactNode }) {
  return (
    <TimezoneContext.Provider value={timezone || DEFAULT_TIMEZONE}>
      {children}
    </TimezoneContext.Provider>
  )
}

export function useTimezone() {
  return useContext(TimezoneContext)
}
