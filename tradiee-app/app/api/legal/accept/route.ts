// POST /api/legal/accept — records the current user's acceptance of the current
// Terms of Service version. Called by the blocking acceptance gate.
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await createServiceClient()
    .from('profiles')
    .update({ terms_accepted_at: new Date().toISOString(), terms_version: CURRENT_TERMS_VERSION })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
