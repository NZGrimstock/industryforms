import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'

type ProfileContextValue = {
  timezone: string
  refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue>({
  timezone: DEFAULT_TIMEZONE,
  refreshProfile: async () => {},
})

export function ProfileProvider({ session, children }: { session: Session | null | undefined; children: React.ReactNode }) {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)

  const refreshProfile = useCallback(async () => {
    if (!session) return
    const { data } = await supabase.from('profiles').select('timezone').eq('id', session.user.id).single()
    setTimezone(data?.timezone || DEFAULT_TIMEZONE)
  }, [session])

  useEffect(() => {
    if (session) refreshProfile()
    else setTimezone(DEFAULT_TIMEZONE)
  }, [session, refreshProfile])

  return (
    <ProfileContext.Provider value={{ timezone, refreshProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useTimezone() {
  return useContext(ProfileContext).timezone
}

export function useProfileRefresh() {
  return useContext(ProfileContext).refreshProfile
}
