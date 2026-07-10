// Shared by the no-deposit auto-confirm path (api/bookings/create), the
// deposit-paid webhook branch, and the admin confirm action — all three need
// to send the same booking automations. Routes through lib/notify.ts so sends
// are logged to automation_events and SMS is dark-until-Twilio with zero code
// changes on go-live.
import { bookingConfirmationEmailHtml, bookingRequestedEmailHtml } from '@/lib/email'
import { notify } from '@/lib/notify'
import { toE164 } from '@/lib/sms'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

type BookingContact = {
  id: string
  customer_email: string | null
  customer_phone: string | null
  customer_name: string
  starts_at: string
  site_address: string | null
}

async function loadCompanyContext(service: SupabaseClient, companyId: string) {
  const [{ data: company }, { data: settings }] = await Promise.all([
    service.from('companies').select('name, phone, country, logo_url').eq('id', companyId).single(),
    service.from('booking_settings').select('timezone, confirmation_channel').eq('company_id', companyId).maybeSingle(),
  ])
  return { company, settings }
}

// `confirmation_channel` (booking_settings) is the company's stated
// preference — 'email' | 'sms' | 'both'. SMS is only ever attempted when the
// preference calls for it; email is always safe to also send since it's live.
function wantsSms(confirmationChannel: string | undefined) {
  return confirmationChannel === 'sms' || confirmationChannel === 'both'
}

export async function sendBookingConfirmationEmail(
  service: SupabaseClient, companyId: string, booking: BookingContact, packageName: string
) {
  const { company, settings } = await loadCompanyContext(service, companyId)
  if (!company) return

  const email = booking.customer_email ? bookingConfirmationEmailHtml({
    companyName: company.name,
    customerName: booking.customer_name,
    packageName,
    startsAt: booking.starts_at,
    timezone: settings?.timezone ?? 'Pacific/Auckland',
    siteAddress: booking.site_address,
    companyPhone: company.phone,
    logoUrl: company.logo_url,
  }) : null

  const smsTo = wantsSms(settings?.confirmation_channel) ? toE164(booking.customer_phone, company.country) : null
  const when = new Date(booking.starts_at).toLocaleString('en-NZ', {
    timeZone: settings?.timezone ?? 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })

  await notify({
    service, companyId, customerId: null, bookingId: booking.id, eventType: 'booking_confirmed',
    email: email ? { to: booking.customer_email, subject: email.subject, html: email.html } : undefined,
    sms: smsTo ? { to: smsTo, country: company.country, body: `Hi ${booking.customer_name.split(' ')[0]}, your ${packageName} booking with ${company.name} is confirmed for ${when}.` } : undefined,
  })
}

export async function sendBookingRequestedEmail(
  service: SupabaseClient, companyId: string, booking: BookingContact, packageName: string
) {
  const { company, settings } = await loadCompanyContext(service, companyId)
  if (!company || !booking.customer_email) return

  const { subject, html } = bookingRequestedEmailHtml({
    companyName: company.name,
    customerName: booking.customer_name,
    packageName,
    startsAt: booking.starts_at,
    timezone: settings?.timezone ?? 'Pacific/Auckland',
    companyPhone: company.phone,
    logoUrl: company.logo_url,
  })

  await notify({
    service, companyId, customerId: null, bookingId: booking.id, eventType: 'booking_requested',
    email: { to: booking.customer_email, subject, html },
  })
}
