import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, reminderEmailHtml } from '@/lib/email'
import { sendSms, smsConfigured } from '@/lib/sms'

// Called by a cron job (e.g. Vercel Cron, pg_cron, or external scheduler)
// Secure with a shared secret header: x-cron-secret
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const sent: string[] = []
  const errors: string[] = []

  // ── Quote follow-ups ─────────────────────────────────────────────────────
  // Sent quotes not viewed/accepted in 3 days, follow_up_at <= now
  const { data: quotesToRemind } = await service
    .from('quotes')
    .select('id, quote_number, title, public_token, subtotal, expires_at, customers(name, email, phone), companies(name, email, phone, country)')
    .eq('status', 'sent')
    .lte('follow_up_at', new Date().toISOString())
    .is('viewed_at', null)

  for (const quote of quotesToRemind ?? []) {
    const customer = quote.customers as unknown as { name: string; email: string | null; phone: string | null } | null
    const company = quote.companies as unknown as { name: string; email: string | null; phone: string | null; country: string | null } | null
    if (!customer || !company) continue
    const viewUrl = `${appUrl}/q/${quote.public_token}`
    let delivered = false

    if (customer.email) {
      const { subject, html } = reminderEmailHtml({
        type: 'quote_followup', companyName: company.name, customerName: customer.name,
        documentNumber: quote.quote_number, amountDue: `$${Number(quote.subtotal).toFixed(2)}`, viewUrl,
      })
      const r = await sendEmail({ to: customer.email, subject, html, replyTo: company.email ?? undefined })
      if (r.error) errors.push(`Quote ${quote.quote_number} email: ${r.error}`)
      else { delivered = true; sent.push(`Quote ${quote.quote_number} email`) }
    }
    if (customer.phone) {
      const r = await sendSms({
        to: customer.phone, country: (company.country as 'NZ' | 'AU') ?? 'NZ',
        body: `Hi ${customer.name.split(' ')[0]}, just following up on quote ${quote.quote_number} from ${company.name}: ${viewUrl}`,
      })
      if (r.error && r.error !== 'SMS service not configured') errors.push(`Quote ${quote.quote_number} sms: ${r.error}`)
      else if (!r.error) { delivered = true; sent.push(`Quote ${quote.quote_number} sms`) }
    }
    if (delivered) {
      await service.from('quotes').update({ follow_up_at: new Date(Date.now() + 7 * 86400000).toISOString() }).eq('id', quote.id)
    }
  }

  // ── Invoice overdue reminders ─────────────────────────────────────────────
  const { data: overdueInvoices } = await service
    .from('invoices')
    .select('id, invoice_number, total, amount_paid, public_token, due_date, customers(name, email, phone), companies(name, email, phone, country)')
    .in('status', ['sent', 'partially_paid', 'overdue'])
    .lt('due_date', new Date().toISOString())

  for (const invoice of overdueInvoices ?? []) {
    const customer = invoice.customers as unknown as { name: string; email: string | null; phone: string | null } | null
    const company = invoice.companies as unknown as { name: string; email: string | null; phone: string | null; country: string | null } | null
    if (!customer || !company) continue
    const daysOverdue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000)
    const amountDue = Number(invoice.total) - Number(invoice.amount_paid)
    const viewUrl = `${appUrl}/i/${invoice.public_token}`

    if (customer.email) {
      const { subject, html } = reminderEmailHtml({
        type: 'invoice_overdue', companyName: company.name, customerName: customer.name,
        documentNumber: invoice.invoice_number, amountDue: `$${amountDue.toFixed(2)}`, daysOverdue, viewUrl,
      })
      const r = await sendEmail({ to: customer.email, subject, html, replyTo: company.email ?? undefined })
      if (r.error) errors.push(`Invoice ${invoice.invoice_number} email: ${r.error}`)
      else sent.push(`Invoice ${invoice.invoice_number} email (${daysOverdue}d)`)
    }
    if (customer.phone) {
      const r = await sendSms({
        to: customer.phone, country: (company.country as 'NZ' | 'AU') ?? 'NZ',
        body: `Hi ${customer.name.split(' ')[0]}, invoice ${invoice.invoice_number} from ${company.name} is overdue ($${amountDue.toFixed(2)}). Pay here: ${viewUrl}`,
      })
      if (r.error && r.error !== 'SMS service not configured') errors.push(`Invoice ${invoice.invoice_number} sms: ${r.error}`)
      else if (!r.error) sent.push(`Invoice ${invoice.invoice_number} sms (${daysOverdue}d)`)
    }
    await service.from('invoices').update({ status: 'overdue' }).eq('id', invoice.id).neq('status', 'overdue')
  }

  // ── Appointment reminders ─────────────────────────────────────────────────
  // Visits starting in the next 24h that haven't been reminded yet.
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 3600000)
  const { data: visits } = await service
    .from('job_visits')
    .select('id, scheduled_start, jobs(title, customers(name, phone), companies(name, country))')
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_start', now.toISOString())
    .lte('scheduled_start', in24h.toISOString())

  for (const visit of visits ?? []) {
    const job = visit.jobs as unknown as { title: string; customers: { name: string; phone: string | null } | null; companies: { name: string; country: string | null } | null } | null
    const customer = job?.customers
    const company = job?.companies
    if (!customer?.phone || !company) { await service.from('job_visits').update({ reminder_sent_at: now.toISOString() }).eq('id', visit.id); continue }
    const when = new Date(visit.scheduled_start).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    const r = await sendSms({
      to: customer.phone, country: (company.country as 'NZ' | 'AU') ?? 'NZ',
      body: `Hi ${customer.name.split(' ')[0]}, reminder: ${company.name} has an appointment with you ${when} (${job!.title}).`,
    })
    if (r.error && r.error !== 'SMS service not configured') errors.push(`Visit ${visit.id} sms: ${r.error}`)
    else if (!r.error) sent.push('Appointment reminder sms')
    await service.from('job_visits').update({ reminder_sent_at: now.toISOString() }).eq('id', visit.id)
  }

  return NextResponse.json({ sent, errors, total: sent.length })
}

// Manual trigger / status check
export async function GET() {
  return NextResponse.json({
    info: 'POST to this endpoint with x-cron-secret header to run reminders',
    envVars: {
      CRON_SECRET: !!process.env.CRON_SECRET,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      TWILIO: smsConfigured(),
    },
  })
}
