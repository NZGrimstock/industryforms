'use client'

import { createContext, useContext } from 'react'

// The company's country ('NZ' or 'AU'). Address autocomplete restricts suggestions
// to this country so a NZ business never sees AU addresses and vice versa.
const CountryContext = createContext<string>('NZ')

export function CountryProvider({ country, children }: { country: string | null | undefined; children: React.ReactNode }) {
  return (
    <CountryContext.Provider value={(country || 'NZ').toUpperCase()}>
      {children}
    </CountryContext.Provider>
  )
}

export function useCountry() {
  return useContext(CountryContext)
}
