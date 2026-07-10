import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { portalEmailHtml } from '@/lib/customer-portal'

const bodySchema = z.object({ customerId: z.string().uuid(), companyId: z.string().uuid() })

export async function POST(req: NextRequest) {
  // Require authenticated session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Missing customerId or companyId' }, { status: 400 })
  const { customerId, companyId } = parsed.data

  // The caller must actually belong to the company they're requesting a
  // portal link for — otherwise any authenticated user from any company
  // could trigger a token + email send for an unrelated company's customer.
  const { data: callerProfile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
  if (!callerProfile || callerProfile.company_id !== companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  // Fetch customer
  const { data: customer, error: customerError } = await service
    .from('customers')
    .select('id, name, email, company_id')
    .eq('id', customerId)
    .eq('company_id', companyId)
    .single()

  if (customerError || !customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
  }
  if (!customer.email) {
    return NextResponse.json({ error: 'Customer has no email address' }, { status: 422 })
  }

  // Fetch company
  const { data: company } = await service
    .from('companies')
    .select('name, email, phone, logo_url')
    .eq('id', companyId)
    .single()

  if (!company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const { data: tokenRow, error: insertError } = await service
    .from('customer_portal_tokens')
    .insert({
      customer_id: customerId,
      company_id: companyId,
      email: customer.email,
    })
    .select('id, token')
    .single()

  if (insertError || !tokenRow) {
    console.error('Portal token insert error', insertError)
    return NextResponse.json({ error: 'Failed to create portal token' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const portalUrl = `${appUrl}/portal/${tokenRow.token}`

  const html = portalEmailHtml({
    companyName: company.name,
    customerName: customer.name,
    portalUrl,
    companyPhone: company.phone,
    companyEmail: company.email,
    logoUrl: company.logo_url,
  })

  const { error: emailError } = await sendEmail({
    to: customer.email,
    subject: `View your jobs with ${company.name}`,
    html,
  })

  if (emailError) {
    await service.from('customer_portal_tokens').delete().eq('id', tokenRow.id)
    return NextResponse.json({ error: emailError }, { status: 500 })
  }

  // Codex build audit marker (2026-07-07): only revoke old working portal
  // links after the replacement link is successfully delivered.
  await service
    .from('customer_portal_tokens')
    .delete()
    .eq('customer_id', customerId)
    .neq('id', tokenRow.id)

  return NextResponse.json({ success: true, email: customer.email })
}
