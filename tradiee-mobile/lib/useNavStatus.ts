// Shared nav-chrome status: role gating (Inbox is admin/owner only) + badge
// counts (pending subcontractor invitations for More, unread inbox items).
// Used by both the underlying (tabs) navigator (which still enforces Inbox's
// route-level access via href: null for staff) and the persistent bottom bar
// rendered globally in the root layout — single source of truth so the two
// don't drift.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useNavStatus() {
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadInbox, setUnreadInbox] = useState(0)
  const [isStaff, setIsStaff] = useState(false)

  useEffect(() => {
    let inboxPoll: ReturnType<typeof setInterval> | null = null

    async function loadProfile() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: profile } = await supabase
        .from('profiles').select('company_id, role').eq('id', session.user.id).single()
      if (!profile?.company_id) return
      const staff = profile.role === 'staff'
      setIsStaff(staff)
      const { count } = await supabase
        .from('job_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('subcontractor_company_id', profile.company_id)
        .eq('status', 'pending')
      setPendingCount(count ?? 0)

      if (!staff) {
        const loadUnread = async () => {
          const [msgs, enq] = await Promise.all([
            supabase.from('customer_messages').select('id', { count: 'exact', head: true })
              .eq('company_id', profile.company_id).eq('direction', 'inbound').is('read_at', null),
            supabase.from('enquiries').select('id', { count: 'exact', head: true })
              .eq('company_id', profile.company_id).eq('status', 'new'),
          ])
          setUnreadInbox((msgs.count ?? 0) + (enq.count ?? 0))
        }
        loadUnread()
        inboxPoll = setInterval(loadUnread, 15000)
      }
    }
    loadProfile()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadProfile())
    return () => { subscription.unsubscribe(); if (inboxPoll) clearInterval(inboxPoll) }
  }, [])

  return { isStaff, pendingCount, unreadInbox }
}
