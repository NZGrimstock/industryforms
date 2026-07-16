import { DEFAULT_TIMEZONE, formatDate } from '@/lib/datetime'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.EMAIL_FROM ?? 'noreply@tradehub.app'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email not sent')
    return { error: 'Email service not configured' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html, reply_to: replyTo }),
  })

  const data = await res.json()
  if (!res.ok) return { error: data.message ?? 'Failed to send email' }
  return { id: data.id }
}

function emailBrandHeader(companyName: string, logoUrl?: string | null) {
  return `<div style="background:#f97316;padding:24px 32px">
      ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="max-height:32px;max-width:200px;display:block" />` : `<p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${companyName}</p>`}
    </div>`
}

export function brandedEmailHtml({
  companyName,
  bodyHtml,
  logoUrl,
}: {
  companyName: string
  bodyHtml: string
  logoUrl?: string | null
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${emailBrandHeader(companyName, logoUrl)}
    <div style="padding:32px">${bodyHtml}</div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${companyName} · Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`
}

export function quoteEmailHtml({
  companyName,
  customerName,
  quoteNumber,
  quoteTitle,
  total,
  expiresAt,
  viewUrl,
  companyPhone,
  companyEmail,
  logoUrl,
  timezone = DEFAULT_TIMEZONE,
}: {
  companyName: string
  customerName: string
  quoteNumber: string
  quoteTitle: string
  total: string
  expiresAt?: string | null
  viewUrl: string
  companyPhone?: string | null
  companyEmail?: string | null
  logoUrl?: string | null
  timezone?: string
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#f97316;padding:24px 32px">
      ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="max-height:32px;max-width:200px;display:block" />` : `<p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${companyName}</p>`}
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${customerName},</p>
      <p style="margin:0 0 24px;color:#6b7280">Please find your quote from ${companyName} attached below.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Quote</p>
        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827">${quoteNumber}</p>
        <p style="margin:0 0 12px;color:#4b5563">${quoteTitle}</p>
        <p style="margin:0;font-size:22px;font-weight:700;color:#f97316">${total}</p>
        ${expiresAt ? `<p style="margin:8px 0 0;font-size:13px;color:#9ca3af">Expires ${formatDate(expiresAt, timezone, { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}
      </div>
      <a href="${viewUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">View &amp; Accept Quote →</a>
      <p style="margin:32px 0 0;font-size:13px;color:#9ca3af">
        Questions? Reply to this email${companyPhone ? ` or call ${companyPhone}` : ''}.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${companyName}${companyEmail ? ` · ${companyEmail}` : ''} · Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`
}

export function invoiceEmailHtml({
  companyName,
  customerName,
  invoiceNumber,
  jobTitle,
  total,
  amountDue,
  dueDate,
  viewUrl,
  companyPhone,
  companyEmail,
  logoUrl,
  timezone = DEFAULT_TIMEZONE,
}: {
  companyName: string
  customerName: string
  invoiceNumber: string
  jobTitle?: string | null
  total: string
  amountDue: string
  dueDate?: string | null
  viewUrl: string
  companyPhone?: string | null
  companyEmail?: string | null
  logoUrl?: string | null
  timezone?: string
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#f97316;padding:24px 32px">
      ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="max-height:32px;max-width:200px;display:block" />` : `<p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${companyName}</p>`}
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${customerName},</p>
      <p style="margin:0 0 24px;color:#6b7280">Please find your invoice from ${companyName} below. Payment is greatly appreciated.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Tax Invoice</p>
        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#111827">${invoiceNumber}</p>
        ${jobTitle ? `<p style="margin:0 0 12px;color:#4b5563">${jobTitle}</p>` : '<p style="margin:0 0 12px"></p>'}
        <p style="margin:0;font-size:22px;font-weight:700;color:#111827">Total: ${total}</p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#f97316">Due: ${amountDue}</p>
        ${dueDate ? `<p style="margin:8px 0 0;font-size:13px;color:#9ca3af">Due date: ${formatDate(dueDate, timezone, { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}
      </div>
      <a href="${viewUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">View &amp; Pay Invoice →</a>
      <p style="margin:32px 0 0;font-size:13px;color:#9ca3af">
        Questions? Reply to this email${companyPhone ? ` or call ${companyPhone}` : ''}.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${companyName}${companyEmail ? ` · ${companyEmail}` : ''} · Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`
}

export function reviewRequestEmailHtml({
  companyName,
  customerName,
  invoiceNumber,
  reviewUrl,
  companyPhone,
  logoUrl,
}: {
  companyName: string
  customerName: string
  invoiceNumber: string
  reviewUrl: string
  companyPhone?: string | null
  logoUrl?: string | null
}) {
  const subject = `Thanks from ${companyName} — could you leave us a quick review?`
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${emailBrandHeader(companyName, logoUrl)}
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${customerName},</p>
      <p style="margin:0 0 16px;color:#4b5563">Thanks so much for paying invoice <strong>${invoiceNumber}</strong> — we really appreciate your business.</p>
      <p style="margin:0 0 24px;color:#4b5563">If you have a minute, a short review goes a long way in helping us reach more local customers.</p>
      <a href="${reviewUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Leave a review →</a>
      <p style="margin:32px 0 0;font-size:13px;color:#9ca3af">
        Questions? Reply to this email${companyPhone ? ` or call ${companyPhone}` : ''}.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${companyName} · Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`
  return { subject, html }
}

export function bookingConfirmationEmailHtml({
  companyName,
  customerName,
  packageName,
  startsAt,
  timezone,
  siteAddress,
  companyPhone,
  logoUrl,
}: {
  companyName: string
  customerName: string
  packageName: string
  startsAt: string
  timezone: string
  siteAddress?: string | null
  companyPhone?: string | null
  logoUrl?: string | null
}) {
  const when = new Date(startsAt).toLocaleString('en-NZ', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  })
  const subject = `Booking confirmed with ${companyName} — ${when}`
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${emailBrandHeader(companyName, logoUrl)}
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${customerName},</p>
      <p style="margin:0 0 16px;color:#4b5563">Your booking is confirmed:</p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 16px">
        <p style="margin:0 0 4px;font-weight:600;color:#111827">${packageName}</p>
        <p style="margin:0;color:#4b5563">${when}</p>
        ${siteAddress ? `<p style="margin:4px 0 0;color:#6b7280;font-size:14px">${siteAddress}</p>` : ''}
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af">
        Questions? Reply to this email${companyPhone ? ` or call ${companyPhone}` : ''}.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${companyName} · Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`
  return { subject, html }
}

export function bookingRequestedEmailHtml({
  companyName,
  customerName,
  packageName,
  startsAt,
  timezone,
  companyPhone,
  logoUrl,
}: {
  companyName: string
  customerName: string
  packageName: string
  startsAt: string
  timezone: string
  companyPhone?: string | null
  logoUrl?: string | null
}) {
  const when = new Date(startsAt).toLocaleString('en-NZ', {
    timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
  })
  const subject = `Booking request received — ${companyName}`
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${emailBrandHeader(companyName, logoUrl)}
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${customerName},</p>
      <p style="margin:0 0 16px;color:#4b5563">Thanks for your booking request — we've got it and will confirm shortly:</p>
      <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:0 0 16px">
        <p style="margin:0 0 4px;font-weight:600;color:#111827">${packageName}</p>
        <p style="margin:0;color:#4b5563">${when}</p>
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af">
        Questions? Reply to this email${companyPhone ? ` or call ${companyPhone}` : ''}.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${companyName} · Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`
  return { subject, html }
}

export function reminderEmailHtml({
  type,
  companyName,
  customerName,
  documentNumber,
  amountDue,
  daysOverdue,
  viewUrl,
  logoUrl,
}: {
  type: 'quote_followup' | 'invoice_overdue' | 'invoice_due_soon'
  companyName: string
  customerName: string
  documentNumber: string
  amountDue: string
  daysOverdue?: number
  viewUrl: string
  logoUrl?: string | null
}) {
  const isQuote = type === 'quote_followup'
  const days = daysOverdue ?? 0
  const subject = isQuote
    ? `Following up on your quote ${documentNumber}`
    : type === 'invoice_due_soon'
      ? `Invoice ${documentNumber} is due ${days === 0 ? 'today' : 'soon'}`
      : `Invoice ${documentNumber} is overdue`
  const body = isQuote
    ? `We wanted to follow up on quote ${documentNumber} we sent you recently. Please let us know if you have any questions or would like to proceed.`
    : type === 'invoice_due_soon'
      ? `Invoice ${documentNumber} for ${amountDue} is due ${days === 0 ? 'today' : `in ${days} day${days !== 1 ? 's' : ''}`}. You can pay online any time using the link below.`
      : `Invoice ${documentNumber} for ${amountDue} is now ${days} day${days !== 1 ? 's' : ''} overdue. Please arrange payment at your earliest convenience.`

  return {
    subject,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    ${emailBrandHeader(companyName, logoUrl)}
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${customerName},</p>
      <p style="margin:0 0 24px;color:#6b7280">${body}</p>
      <a href="${viewUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">
        ${isQuote ? 'View Quote →' : 'Pay Now →'}
      </a>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`,
  }
}

// Tap to Pay on iPhone launch announcement — sent FROM IndustryForms to its own
// merchant users (Apple App Review requirement 6.1: launch email on day one).
//
// Copy is Apple's exact pre-approved wording (Marketing Guide Aug 2025) — do NOT
// edit the product claims. "Tap to Pay on iPhone" must be the first sentence,
// legal disclaimers are mandatory, and only Apple-provided artwork may be used.
export function tapToPayLaunchEmailHtml({ recipientName, appUrl }: { recipientName: string; appUrl: string }) {
  const heroUrl = `${appUrl}/tap-to-pay-hero.png`
  const ctaUrl = `${appUrl}/login`
  const regionsUrl = 'https://developer.apple.com/tap-to-pay/regions/'
  return {
    subject: 'Now available: Tap to Pay on iPhone',
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb">
      <img src="${appUrl}/Logo.png" alt="IndustryForms" style="height:40px;max-width:220px;display:block" />
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${recipientName},</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#111827">Tap to Pay on iPhone is now available in IndustryForms.</h1>
      <img src="${heroUrl}" alt="A customer holding a contactless card to a merchant's iPhone to pay." width="320" style="display:block;margin:8px auto 24px;width:320px;max-width:100%;height:auto" />
      <p style="margin:0 0 24px;color:#6b7280;line-height:1.5">You can accept all types of contactless payments right on your iPhone — from physical debit and credit cards to Apple Pay and other digital wallets. No extra terminals or hardware needed.</p>
      <div style="text-align:center;margin:0 0 8px">
        <a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:10px;font-weight:700;font-size:16px">Get started</a>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5">
        <strong>Terms apply.</strong> Tap to Pay on iPhone requires a supported payment app and the latest version of iOS. Update by going to Settings &gt; General &gt; Software Update. Some contactless cards may not be accepted by your payment app. Transaction limits may apply. The Contactless Symbol is a trademark owned by and used with permission of EMVCo, LLC. Tap to Pay on iPhone is not available in all markets. For Tap to Pay on iPhone countries and regions, see <a href="${regionsUrl}" style="color:#9ca3af">${regionsUrl}</a>.
      </p>
      <p style="margin:0 0 8px;font-size:11px;color:#9ca3af;line-height:1.5">
        Apple Pay is a service provided by Apple Payments Services LLC, a subsidiary of Apple Inc. Neither Apple Inc. nor Apple Payments Services LLC is a bank. Any card used in Apple Pay is offered by the card issuer.
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af">Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`,
  }
}
