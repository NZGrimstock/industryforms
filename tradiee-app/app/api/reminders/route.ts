import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, reminderEmailHtml } from '@/lib/email'
import { sendSms, smsConfigured } from '@/lib/sms'
import { nextDocNumber } from '@/lib/numbering'

function addInterval(dateStr: string, interval: string | null): string {
  const d = new Date(dateStr)
  switch (interval) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'fortnightly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    default: d.setFullYear(d.getFullYear() + 1)
  }
  return d.toISOString().slice(0, 10)
}

// The job loops over many records sending email/SMS — give it headroom past the
// default serverless timeout.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Called by a cron job (e.g. Vercel Cron, pg_cron, or external scheduler).
// Two auth paths share one job runner:
//  - POST with header `x-cron-secret: <CRON_SECRET>` (external scheduler / manual)
//  - GET with `Authorization: Bearer <CRON_SECRET>` (Vercel Cron — see vercel.json;
//    Vercel injects this header automatically when CRON_SECRET is set in the project)
export async function POST(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runReminders()
}

async function runReminders() {
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

  // ── Payment reminders (dunning sequence) ──────────────────────────────────
  // Throttled to ~weekly per invoice: a "due soon" nudge from ~4 days before the
  // due date, then escalating "overdue" reminders until paid.
  const windowEnd = new Date(Date.now() + 4 * 86400000).toISOString()
  const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString()
  const { data: dueInvoices } = await service
    .from('invoices')
    .select('id, invoice_number, total, amount_paid, public_token, due_date, last_reminder_at, customers(name, email, phone), companies(name, email, phone, country)')
    .in('status', ['sent', 'partially_paid', 'overdue'])
    .not('due_date', 'is', null)
    .lte('due_date', windowEnd)
    .or(`last_reminder_at.is.null,last_reminder_at.lt.${sixDaysAgo}`)

  for (const invoice of dueInvoices ?? []) {
    const customer = invoice.customers as unknown as { name: string; email: string | null; phone: string | null } | null
    const company = invoice.companies as unknown as { name: string; email: string | null; phone: string | null; country: string | null } | null
    if (!customer || !company) continue
    const daysFromDue = Math.floor((Date.now() - new Date(invoice.due_date as string).getTime()) / 86400000)
    const overdue = daysFromDue > 0
    const amountDue = Number(invoice.total) - Number(invoice.amount_paid)
    if (amountDue <= 0.01) continue
    const viewUrl = `${appUrl}/i/${invoice.public_token}`
    const dueLabel = overdue ? `${daysFromDue} day${daysFromDue !== 1 ? 's' : ''} overdue` : daysFromDue === 0 ? 'due today' : `due in ${-daysFromDue} day${-daysFromDue !== 1 ? 's' : ''}`

    if (customer.email) {
      const { subject, html } = reminderEmailHtml({
        type: overdue ? 'invoice_overdue' : 'invoice_due_soon', companyName: company.name, customerName: customer.name,
        documentNumber: invoice.invoice_number, amountDue: `$${amountDue.toFixed(2)}`, daysOverdue: overdue ? daysFromDue : -daysFromDue, viewUrl,
      })
      const r = await sendEmail({ to: customer.email, subject, html, replyTo: company.email ?? undefined })
      if (r.error) errors.push(`Invoice ${invoice.invoice_number} email: ${r.error}`)
      else sent.push(`Invoice ${invoice.invoice_number} email (${dueLabel})`)
    }
    if (customer.phone) {
      const r = await sendSms({
        to: customer.phone, country: (company.country as 'NZ' | 'AU') ?? 'NZ',
        body: `Hi ${customer.name.split(' ')[0]}, invoice ${invoice.invoice_number} from ${company.name} ($${amountDue.toFixed(2)}) is ${dueLabel}. View & pay: ${viewUrl}`,
      })
      if (r.error && r.error !== 'SMS service not configured') errors.push(`Invoice ${invoice.invoice_number} sms: ${r.error}`)
      else if (!r.error) sent.push(`Invoice ${invoice.invoice_number} sms (${dueLabel})`)
    }
    await service.from('invoices').update({
      last_reminder_at: new Date().toISOString(),
      ...(overdue ? { status: 'overdue' } : {}),
    }).eq('id', invoice.id)
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

  // ── Recurring jobs ────────────────────────────────────────────────────────
  // Clone jobs whose recurrence is due, then roll the next occurrence forward.
  const today = new Date().toISOString().slice(0, 10)
  const { data: recJobs } = await service
    .from('jobs')
    .select('id, company_id, customer_id, site_id, title, description, reference, recurrence_rule, recurrence_next, recurrence_end')
    .eq('is_recurring', true)
    .not('recurrence_next', 'is', null)
    .lte('recurrence_next', today)

  for (const rj of recJobs ?? []) {
    if (rj.recurrence_end && rj.recurrence_end < today) continue
    try {
      const jobNumber = await nextDocNumber(service, rj.company_id as string, 'job')
      await service.from('jobs').insert({
        company_id: rj.company_id, customer_id: rj.customer_id, site_id: rj.site_id,
        job_number: jobNumber, title: rj.title, description: rj.description,
        reference: rj.reference, status: 'unscheduled',
      })
      await service.from('jobs').update({
        recurrence_next: addInterval(rj.recurrence_next as string, rj.recurrence_rule as string | null),
      }).eq('id', rj.id)
      sent.push(`Recurring job ${jobNumber}`)
    } catch (e) {
      errors.push(`Recurring job ${rj.id}: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  // ── Service reminders ─────────────────────────────────────────────────────
  const { data: dueReminders } = await service
    .from('service_reminders')
    .select('id, due_date, interval, title, customers(name, email), companies(name, email)')
    .eq('status', 'pending')
    .lte('due_date', today)

  for (const sr of dueReminders ?? []) {
    const customer = sr.customers as unknown as { name: string; email: string | null } | null
    const company = sr.companies as unknown as { name: string; email: string | null } | null
    if (customer?.email && company) {
      const r = await sendEmail({
        to: customer.email,
        subject: `${sr.title} — service due`,
        html: `<p>Hi ${customer.name.split(' ')[0]},</p><p>This is a friendly reminder from ${company.name} that <strong>${sr.title}</strong> is now due. We'll be in touch to arrange a suitable time, or reply to this email to book.</p><p>${company.name}</p>`,
        replyTo: company.email ?? undefined,
      })
      if (r.error) errors.push(`Service reminder ${sr.id}: ${r.error}`)
      else sent.push(`Service reminder: ${sr.title}`)
    }
    // Roll forward if repeating, otherwise mark sent.
    if (sr.interval) {
      await service.from('service_reminders').update({ due_date: addInterval(sr.due_date as string, sr.interval as string), last_sent_at: new Date().toISOString() }).eq('id', sr.id)
    } else {
      await service.from('service_reminders').update({ status: 'sent', last_sent_at: new Date().toISOString() }).eq('id', sr.id)
    }
  }

  return NextResponse.json({ sent, errors, total: sent.length })
}

// Vercel Cron entrypoint (authed GET) + status check (unauthed GET).
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return runReminders()
  }
  return NextResponse.json({
    info: 'Authed GET (Vercel Cron) or POST with x-cron-secret header runs reminders',
    envVars: {
      CRON_SECRET: !!process.env.CRON_SECRET,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      TWILIO: smsConfigured(),
    },
  })
}
