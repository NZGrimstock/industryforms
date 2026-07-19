'use client'

import { createContext, useContext } from 'react'

export type SubscriptionInfo = {
  plan: string | null
  status: string | null
  trialEndsAt: string | null
  billingExempt: boolean
}

const SubscriptionContext = createContext<SubscriptionInfo>({ plan: null, status: null, trialEndsAt: null, billingExempt: false })

export function SubscriptionProvider({ info, children }: { info: SubscriptionInfo; children: React.ReactNode }) {
  return (
    <SubscriptionContext.Provider value={info}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  return useContext(SubscriptionContext)
}
