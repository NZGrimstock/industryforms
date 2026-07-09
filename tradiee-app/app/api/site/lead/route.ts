import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyCompanyInbox } from '@/lib/push'

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).nullish().or(z.literal('')),
  phone: z.string().trim().max(50).nullish().or(z.literal('')),
  message: z.string().trim().max(4000).nullish(),
  kind: z.string().max(50).nullish(),
}).refine(d => !!d.email || !!d.phone, { message: 'Name and a contact detail are required' })

// Public lead capture from a company's Instant Website contact form.
// Creates an enquiry (source = 'website') for the site owner's company.
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Name and a contact detail are required' }, { status: 400 })
  }
  const { slug, name, email, phone, message, kind } = parsed.data

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
  const { data: enquiry, error } = await service.from('enquiries').insert({
    company_id: site.company_id,
    customer_name: String(name).slice(0, 200),
    customer_email: email ? String(email).slice(0, 200) : null,
    customer_phone: phone ? String(phone).slice(0, 50) : null,
    description: message ? String(message).slice(0, 4000) : null,
    source: isBooking ? 'booking' : 'website',
    status: 'new',
  }).select('id').single()

  if (error) return NextResponse.json({ error: 'Could not submit enquiry' }, { status: 500 })

  if (enquiry) {
    await notifyCompanyInbox(service, site.company_id, {
      title: isBooking ? `Booking request — ${name}` : `New website lead — ${name}`,
      body: message ? String(message).slice(0, 180) : (email || phone || ''),
      key: `enquiry:${enquiry.id}`,
      phone: phone || null,
    })
  }

  return NextResponse.json({ ok: true })
}
