// GET /api/messages/conversations
//
// Unified inbox feed: merges customer_messages (SMS, grouped by customer —
// or one entry per unmatched sender) with enquiries (website leads + other
// enquiry sources). Owner/admin only. Runs under the caller's session so
// RLS scopes everything to their company.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getConversations } from '@/lib/messages'
import { smsConfigured } from '@/lib/sms'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const conversations = await getConversations(supabase)
  return NextResponse.json({ conversations, smsEnabled: smsConfigured() })
}
