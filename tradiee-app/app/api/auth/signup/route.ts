import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { fullName, email, password, companyName, companyAddress, tradeType, country, phone } = await request.json()

    if (!fullName || !email || !password || !companyName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Create the auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    const userId = authData.user.id
    const gstRate = country === 'AU' ? 0.10 : 0.15
    const trialEndsAt = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString()

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        name: companyName,
        trade_type: tradeType || null,
        country,
        phone: phone || null,
        address: companyAddress || null,
        default_gst_rate: gstRate,
        subscription_plan: 'trial',
        subscription_status: 'trialing',
        trial_ends_at: trialEndsAt,
      })
      .select()
      .single()
    if (companyError) {
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: companyError.message }, { status: 400 })
    }

    // Create profile (owner)
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        company_id: company.id,
        full_name: fullName,
        email,
        phone: phone || null,
        role: 'owner',
      })
    if (profileError) {
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    console.log(`[signup] ${companyName} (${company.id}) — trade: ${tradeType || 'not specified'}`)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
