// GET /api/messages/conversations
//
// Unified inbox feed: merges customer_messages (SMS, grouped by customer —
// or one entry per unmatched sender) with enquiries (website leads + other
// enquiry sources). Owner/admin only.
//
// Uses resolveCompanyUser (cookie or mobile Bearer token) rather than a bare
// cookie-only getUser() — the mobile app has no cookie, so that always came
// back unauthenticated here. The service client bypasses RLS, so
// getConversations() takes companyId and filters explicitly instead.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { getConversations } from '@/lib/messages'
import { smsConfigured } from '@/lib/sms'

export async function GET(req: NextRequest) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const conversations = await getConversations(createServiceClient(), auth.companyId)
  return NextResponse.json({ conversations, smsEnabled: smsConfigured() })
}
