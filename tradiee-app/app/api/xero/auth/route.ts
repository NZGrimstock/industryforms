import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getXeroAuthUrl } from '@/lib/xero'
import { isFreePlanCompany } from '@/lib/billing'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.redirect(new URL('/login', req.url))
  if (await isFreePlanCompany(supabase, profile.company_id)) {
    return NextResponse.redirect(new URL('/upgrade', req.url))
  }

  // State encodes the company_id for the callback
  const state = Buffer.from(JSON.stringify({ companyId: profile.company_id, userId: user.id })).toString('base64url')
  return NextResponse.redirect(getXeroAuthUrl(state))
}
