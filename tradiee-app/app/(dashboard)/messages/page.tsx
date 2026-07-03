import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { smsConfigured } from '@/lib/sms'
import { getConversations } from '@/lib/messages'
import { MessagesClient } from './client'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  // Owner/admin only — same gate used for other sales/comms surfaces.
  if (profile?.role === 'staff') redirect('/dashboard')

  const conversations = await getConversations(supabase)

  return (
    <>
      <Header title="Messages" profile={profile} />
      <MessagesClient initial={conversations} twilioLive={smsConfigured()} />
    </>
  )
}
