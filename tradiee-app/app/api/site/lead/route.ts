import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Public lead capture from a company's Instant Website contact form.
// Creates an enquiry (source = 'website') for the site owner's company.
export async function POST(req: NextRequest) {
  const { slug, name, email, phone, message, kind } = await req.json().catch(() => ({}))

  if (!slug || !name || (!email && !phone)) {
    return NextResponse.json({ error: 'Name and a contact detail are required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: site } = await service
    .from('company_websites')
    .select('company_id, is_published')
    .eq('slug', slug)
    .single()

  if (!site || !site.is_published) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }

  const isBooking = kind === 'booking'
  const { error } = await service.from('enquiries').insert({
    company_id: site.company_id,
    customer_name: String(name).slice(0, 200),
    customer_email: email ? String(email).slice(0, 200) : null,
    customer_phone: phone ? String(phone).slice(0, 50) : null,
    description: message ? String(message).slice(0, 4000) : null,
    source: isBooking ? 'booking' : 'website',
    status: 'new',
  })

  if (error) return NextResponse.json({ error: 'Could not submit enquiry' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
