import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, reminderEmailHtml, invoiceEmailHtml } from '@/lib/email'
import { isSmsBillingDisabledError, retryFailedSmsMeterEvents, sendSms, smsConfigured, toE164 } from '@/lib/sms'
import { nextDocNumber } from '@/lib/numbering'
import { notify } from '@/lib/notify'
import { DEFAULT_JOB_STATUSES } from '@/lib/job-statuses'
import { logCommunication } from '@/lib/comms'

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
  const smsMeterRetry = await retryFailedSmsMeterEvents()
  if (smsMeterRetry.retried) sent.push(`SMS meter retries ${smsMeterRetry.retried}`)
  if (smsMeterRetry.failed) errors.push(`SMS meter retries failed ${smsMeterRetry.failed}`)

  const { data: reapedHolds, error: reapHoldsError } = await service
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('status', 'slot_held')
    .lt('hold_expires_at', new Date().toISOString())
    .select('id')
  if (reapHoldsError) {
    errors.push(`Expired booking holds cleanup: ${reapHoldsError.message}`)
  } else if (reapedHolds?.length) {
    sent.push(`Expired booking holds cleaned ${reapedHolds.length}`)
  }

  // ── Quote follow-ups ─────────────────────────────────────────────────────
  // Sent quotes not viewed/accepted in 3 days, follow_up_at <= now
  const { data: quotesToRemind } = await service
    .from('quotes')
    .select('id, company_id, customer_id, quote_number, title, public_token, subtotal, expires_at, customers(name, email, phone), companies(name, email, phone, country)')
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
        companyId: quote.company_id,
        relatedType: 'quote_followup',
        relatedId: quote.id,
      })
      if (r.error && r.error !== 'SMS service not configured' && !isSmsBillingDisabledError(r.error)) errors.push(`Quote ${quote.quote_number} sms: ${r.error}`)
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
    .select('id, company_id, customer_id, invoice_number, total, amount_paid, public_token, due_date, last_reminder_at, customers(name, email, phone), companies(name, email, phone, country)')
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
    let delivered = false

    if (customer.email) {
      const { subject, html } = reminderEmailHtml({
        type: overdue ? 'invoice_overdue' : 'invoice_due_soon', companyName: company.name, customerName: customer.name,
        documentNumber: invoice.invoice_number, amountDue: `$${amountDue.toFixed(2)}`, daysOverdue: overdue ? daysFromDue : -daysFromDue, viewUrl,
      })
      const r = await sendEmail({ to: customer.email, subject, html, replyTo: company.email ?? undefined })
      if (r.error) errors.push(`Invoice ${invoice.invoice_number} email: ${r.error}`)
      else { delivered = true; sent.push(`Invoice ${invoice.invoice_number} email (${dueLabel})`) }
    }
    if (customer.phone) {
      const r = await sendSms({
        to: customer.phone, country: (company.country as 'NZ' | 'AU') ?? 'NZ',
        body: `Hi ${customer.name.split(' ')[0]}, invoice ${invoice.invoice_number} from ${company.name} ($${amountDue.toFixed(2)}) is ${dueLabel}. View & pay: ${viewUrl}`,
        companyId: invoice.company_id,
        relatedType: 'invoice_reminder',
        relatedId: invoice.id,
      })
      if (r.error && r.error !== 'SMS service not configured' && !isSmsBillingDisabledError(r.error)) errors.push(`Invoice ${invoice.invoice_number} sms: ${r.error}`)
      else if (!r.error) { delivered = true; sent.push(`Invoice ${invoice.invoice_number} sms (${dueLabel})`) }
    }
    if (delivered || overdue) {
      await service.from('invoices').update({
        ...(delivered ? { last_reminder_at: new Date().toISOString() } : {}),
        ...(overdue ? { status: 'overdue' } : {}),
      }).eq('id', invoice.id)
    }
  }

  // ── Booking appointment reminders (email + sms, logged) ───────────────────
  // Booking-sourced visits get the full notify() treatment so the confirmation
  // and reminder come from the same automation trail. Failed/skipped attempts
  // are logged but do not count as sent or stamp the visit.
  const now = new Date()
  const in24h = new Date(now.getTime() + 24 * 3600000)
  const bookingVisitIds = new Set<string>()
  const bookingVisitReminderSentIds = new Set<string>()

  const { data: reminderBookings } = await service
    .from('bookings')
    .select('id, visit_id, company_id, customer_id, customer_name, customer_email, customer_phone, package_id, starts_at')
    .in('status', ['confirmed', 'scheduled'])
    .not('visit_id', 'is', null)
    .gte('starts_at', now.toISOString())
    .lte('starts_at', in24h.toISOString())

  if (reminderBookings?.length) {
    const { data: alreadySent } = await service
      .from('automation_events')
      .select('booking_id, status')
      .eq('event_type', 'booking_reminder_24h')
      .eq('status', 'sent')
      .in('booking_id', reminderBookings.map(b => b.id))
    const alreadySentIds = new Set((alreadySent ?? []).map(r => r.booking_id))

    for (const b of reminderBookings) {
      bookingVisitIds.add(b.visit_id as string)
      if (alreadySentIds.has(b.id)) {
        bookingVisitReminderSentIds.add(b.visit_id as string)
        continue
      }

      const [{ data: company }, { data: settingsRow }, { data: pkg }] = await Promise.all([
        service.from('companies').select('name, country').eq('id', b.company_id).single(),
        service.from('booking_settings').select('timezone, confirmation_channel').eq('company_id', b.company_id).maybeSingle(),
        service.from('bookable_packages').select('name').eq('id', b.package_id).single(),
      ])
      if (!company) continue
      const timezone = settingsRow?.timezone ?? 'Pacific/Auckland'
      const when = new Date(b.starts_at).toLocaleString('en-NZ', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      const smsTo = (settingsRow?.confirmation_channel === 'sms' || settingsRow?.confirmation_channel === 'both') ? toE164(b.customer_phone, company.country) : null

      const notifyResults = await notify({
        service, companyId: b.company_id, customerId: b.customer_id, bookingId: b.id, eventType: 'booking_reminder_24h',
        email: b.customer_email ? {
          to: b.customer_email, subject: `Reminder: ${pkg?.name ?? 'your booking'} tomorrow`,
          html: `<p>Hi ${b.customer_name.split(' ')[0]},</p><p>Reminder — ${company.name} has you booked for <strong>${pkg?.name ?? 'your appointment'}</strong> on ${when}.</p>`,
        } : undefined,
        sms: smsTo ? { to: smsTo, country: company.country, body: `Hi ${b.customer_name.split(' ')[0]}, reminder: ${company.name} has your ${pkg?.name ?? 'booking'} ${when}.` } : undefined,
      })
      if (notifyResults.some(result => result.status === 'sent')) {
        bookingVisitReminderSentIds.add(b.visit_id as string)
        sent.push(`Booking reminder ${b.id}`)
      } else {
        errors.push(`Booking reminder ${b.id} not sent`)
      }
    }
  }

  // ── Appointment reminders (non-booking visits) ────────────────────────────
  // Visits starting in the next 24h that haven't been reminded yet.
  const { data: visits } = await service
    .from('job_visits')
    .select('id, scheduled_start, jobs(id, company_id, title, customer_id, customers(id, name, phone), companies(id, name, country))')
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_start', now.toISOString())
    .lte('scheduled_start', in24h.toISOString())

  for (const visit of visits ?? []) {
    if (bookingVisitIds.has(visit.id)) {
      if (bookingVisitReminderSentIds.has(visit.id)) {
        await service.from('job_visits').update({ reminder_sent_at: now.toISOString() }).eq('id', visit.id)
      } else {
        errors.push(`Booking visit ${visit.id} reminder not sent; reminder_sent_at not updated`)
      }
      continue
    }
    const job = visit.jobs as unknown as {
      id: string
      company_id: string
      title: string
      customer_id: string | null
      customers: { id: string; name: string; phone: string | null } | null
      companies: { id: string; name: string; country: string | null } | null
    } | null
    const customer = job?.customers
    const company = job?.companies
    if (!customer?.phone || !company) {
      errors.push(`Visit ${visit.id} reminder skipped: missing customer phone or company`)
      continue
    }
    const when = new Date(visit.scheduled_start).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    const body = `Hi ${customer.name.split(' ')[0]}, reminder: ${company.name} has an appointment with you ${when} (${job!.title}).`
    // Codex build audit marker (2026-07-07): plain visit reminders now leave automation + comms history.
    const notifyResults = await notify({
      service,
      companyId: job.company_id,
      customerId: job.customer_id,
      eventType: 'visit_reminder_24h',
      sms: {
        to: customer.phone,
        country: (company.country as 'NZ' | 'AU') ?? 'NZ',
        body,
      },
    })
    const smsResult = notifyResults.find(result => result.channel === 'sms')
    if (smsResult?.status === 'sent') {
      await logCommunication(service, {
        companyId: job.company_id,
        customerId: job.customer_id,
        channel: 'sms',
        subject: 'Appointment reminder',
        summary: body,
        relatedType: 'reminder',
        relatedId: visit.id,
      })
      sent.push('Appointment reminder sms')
      await service.from('job_visits').update({ reminder_sent_at: now.toISOString() }).eq('id', visit.id)
    } else if (smsResult?.status === 'skipped_sms_billing_off') {
      sent.push(`Visit ${visit.id} sms skipped: billing off`)
    } else {
      errors.push(`Visit ${visit.id} reminder not sent: ${smsResult?.status ?? 'no_sms_result'}${smsResult?.error ? ` (${smsResult.error})` : ''}`)
    }
  }

  // ── Post-completion invoicing ──────────────────────────────────────────────
  // Bookings whose package is flagged creates_invoice: once the linked job
  // completes, generate a draft invoice at the package price and email it.
  // Scope note: "completed" is checked literally (the seeded default terminal
  // key) rather than resolving each company's custom job_statuses — a company
  // that renames its completed status won't trigger this until that's made
  // configurable. Good enough for a first version; not a correctness issue
  // for the (currently 100%) default-status companies.
  const { data: invoiceCandidates } = await service
    .from('bookings')
    .select('id, company_id, customer_id, site_address, job_id, bookable_packages!inner(name, price, creates_invoice)')
    .not('job_id', 'is', null)
    .is('invoice_id', null)
    .eq('bookable_packages.creates_invoice', true)

  for (const b of invoiceCandidates ?? []) {
    const pkg = b.bookable_packages as unknown as { name: string; price: number; creates_invoice: boolean } | null
    if (!pkg?.creates_invoice) continue
    const { data: job } = await service.from('jobs').select('status').eq('id', b.job_id).single()
    if (job?.status !== 'completed') continue

    try {
      const { data: co } = await service.from('companies').select('default_gst_rate, name, email, phone, logo_url').eq('id', b.company_id).single()
      const gstRate = Number(co?.default_gst_rate ?? 0.15)
      const subtotal = Number(pkg.price)
      const gst = subtotal * gstRate
      const total = subtotal + gst
      const invoiceNumber = await nextDocNumber(service, b.company_id, 'invoice')

      const { data: inv } = await service.from('invoices').insert({
        company_id: b.company_id, customer_id: b.customer_id, job_id: b.job_id,
        invoice_number: invoiceNumber, status: 'draft',
        subtotal, gst_amount: gst, total, amount_paid: 0,
      }).select('id, public_token').single()
      if (!inv) continue

      await service.from('invoice_line_items').insert({
        invoice_id: inv.id, type: 'labour', description: pkg.name,
        quantity: 1, unit: 'each', unit_price: pkg.price, line_total: pkg.price, sort_order: 0,
      })
      await service.from('bookings').update({ invoice_id: inv.id }).eq('id', b.id)

      const { data: customer } = await service.from('customers').select('name, email').eq('id', b.customer_id).single()
      if (customer?.email && co) {
        const html = invoiceEmailHtml({
          companyName: co.name, customerName: customer.name, invoiceNumber, jobTitle: pkg.name,
          total: `$${total.toFixed(2)}`, amountDue: `$${total.toFixed(2)}`, dueDate: null,
          viewUrl: `${appUrl}/i/${inv.public_token}`, companyPhone: co.phone, companyEmail: co.email, logoUrl: co.logo_url,
        })
        await notify({
          service, companyId: b.company_id, customerId: b.customer_id, bookingId: b.id, eventType: 'post_completion_invoice',
          email: { to: customer.email, subject: `Invoice ${invoiceNumber} from ${co.name}`, html, replyTo: co.email },
        })
        await service.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', inv.id)
      }
      sent.push(`Post-completion invoice ${invoiceNumber}`)
    } catch (e) {
      errors.push(`Post-completion invoice for booking ${b.id}: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  // ── Win-back reminders ─────────────────────────────────────────────────────
  // Completed jobs whose booking package has a recurring_interval_months set:
  // queue a re-book message once that interval has elapsed since completion.
  // Email now; sms logs skipped_sms_dark until Twilio, per the sprint doc.
  const { data: terminalStatuses } = await service.from('job_statuses').select('company_id, key').eq('is_terminal', true)
  const terminalByCompany = new Map<string, Set<string>>()
  for (const s of terminalStatuses ?? []) {
    if (!terminalByCompany.has(s.company_id)) terminalByCompany.set(s.company_id, new Set())
    terminalByCompany.get(s.company_id)!.add(s.key)
  }
  // Companies with no job_statuses rows (new signups — the seed only backfilled
  // existing companies at migration time) fall back to the same defaults every
  // other job-status reader in the app uses (lib/job-statuses.ts).
  const defaultTerminalKeys = new Set(DEFAULT_JOB_STATUSES.filter(s => s.is_terminal).map(s => s.key))
  function isTerminalStatus(companyId: string, statusKey: string): boolean {
    const custom = terminalByCompany.get(companyId)
    return custom ? custom.has(statusKey) : defaultTerminalKeys.has(statusKey)
  }

  const { data: winBackCandidates } = await service
    .from('bookings')
    .select('id, company_id, customer_id, customer_name, customer_email, customer_phone, package_id, job_id, visit_id, bookable_packages!inner(name, recurring_interval_months), jobs!inner(status)')
    .not('job_id', 'is', null)
    .not('bookable_packages.recurring_interval_months', 'is', null)

  for (const b of winBackCandidates ?? []) {
    const pkg = b.bookable_packages as unknown as { name: string; recurring_interval_months: number | null } | null
    const job = b.jobs as unknown as { status: string } | null
    if (!pkg?.recurring_interval_months || !job) continue
    if (!isTerminalStatus(b.company_id, job.status)) continue

    const { data: visit } = b.visit_id ? await service.from('job_visits').select('actual_end, scheduled_end').eq('id', b.visit_id).single() : { data: null }
    const doneAt = visit?.actual_end ?? visit?.scheduled_end
    if (!doneAt) continue
    const dueDate = new Date(doneAt)
    dueDate.setMonth(dueDate.getMonth() + pkg.recurring_interval_months)
    if (dueDate.getTime() > now.getTime()) continue

    const { data: already } = await service.from('automation_events').select('id').eq('booking_id', b.id).eq('event_type', 'win_back').maybeSingle()
    if (already) continue

    const [{ data: company }, { data: site }] = await Promise.all([
      service.from('companies').select('name, country').eq('id', b.company_id).maybeSingle(),
      service.from('company_websites').select('slug').eq('company_id', b.company_id).maybeSingle(),
    ])
    if (!company) continue
    const rebookUrl = site?.slug ? `${appUrl}/site/${site.slug}/book/${b.package_id}` : appUrl

    await notify({
      service, companyId: b.company_id, customerId: b.customer_id, bookingId: b.id, eventType: 'win_back',
      email: b.customer_email ? {
        to: b.customer_email, subject: `Time for another ${pkg.name}?`,
        html: `<p>Hi ${b.customer_name.split(' ')[0]},</p><p>It's been a while since your last ${pkg.name} with ${company.name} — ready to book again?</p><p><a href="${rebookUrl}">Book now</a></p>`,
      } : undefined,
      sms: b.customer_phone ? { to: toE164(b.customer_phone, company.country), body: `Hi ${b.customer_name.split(' ')[0]}, it's ${company.name} — time to re-book your ${pkg.name}? ${rebookUrl}` } : undefined,
    })
    sent.push(`Win-back ${b.id}`)
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

  // ── Recurring invoices ────────────────────────────────────────────────────
  // Clone due recurring invoices (header + line items) as fresh drafts.
  const { data: recInvoices } = await service
    .from('invoices')
    .select('id, company_id, customer_id, job_id, reference, subtotal, discount_type, discount_value, discount_amount, gst_amount, total, terms, recurrence_rule, recurrence_next, recurrence_end')
    .eq('is_recurring', true)
    .not('recurrence_next', 'is', null)
    .lte('recurrence_next', today)

  for (const ri of recInvoices ?? []) {
    if (ri.recurrence_end && ri.recurrence_end < today) continue
    try {
      const invNumber = await nextDocNumber(service, ri.company_id as string, 'invoice')
      const { data: newInv } = await service.from('invoices').insert({
        company_id: ri.company_id, customer_id: ri.customer_id, job_id: ri.job_id,
        invoice_number: invNumber, reference: ri.reference, status: 'draft',
        subtotal: ri.subtotal, discount_type: ri.discount_type, discount_value: ri.discount_value,
        discount_amount: ri.discount_amount, gst_amount: ri.gst_amount, total: ri.total,
        amount_paid: 0, terms: ri.terms,
      }).select('id').single()
      if (newInv) {
        const { data: lines } = await service.from('invoice_line_items').select('type, description, quantity, unit, unit_price, discount_type, discount_value, line_total, sort_order').eq('invoice_id', ri.id)
        if (lines && lines.length) {
          await service.from('invoice_line_items').insert(lines.map(l => ({ ...l, invoice_id: newInv.id })))
        }
      }
      await service.from('invoices').update({ recurrence_next: addInterval(ri.recurrence_next as string, ri.recurrence_rule as string | null) }).eq('id', ri.id)
      sent.push(`Recurring invoice ${invNumber}`)
    } catch (e) {
      errors.push(`Recurring invoice ${ri.id}: ${e instanceof Error ? e.message : 'failed'}`)
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
    let delivered = false
    if (customer?.email && company) {
      const r = await sendEmail({
        to: customer.email,
        subject: `${sr.title} — service due`,
        html: `<p>Hi ${customer.name.split(' ')[0]},</p><p>This is a friendly reminder from ${company.name} that <strong>${sr.title}</strong> is now due. We'll be in touch to arrange a suitable time, or reply to this email to book.</p><p>${company.name}</p>`,
        replyTo: company.email ?? undefined,
      })
      if (r.error) errors.push(`Service reminder ${sr.id}: ${r.error}`)
      else { delivered = true; sent.push(`Service reminder: ${sr.title}`) }
    } else {
      errors.push(`Service reminder ${sr.id} not sent: missing customer email or company`)
    }
    if (!delivered) continue

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
