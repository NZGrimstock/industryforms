function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function portalEmailHtml({
  companyName,
  customerName,
  portalUrl,
  companyPhone,
  companyEmail,
  logoUrl,
}: {
  companyName: string
  customerName: string
  portalUrl: string
  companyPhone?: string | null
  companyEmail?: string | null
  logoUrl?: string | null
}) {
  const safeCompanyName = escapeHtml(companyName)
  const safeCustomerName = escapeHtml(customerName)
  const safePortalUrl = escapeHtml(portalUrl)
  const safeCompanyPhone = companyPhone ? escapeHtml(companyPhone) : ''
  const safeCompanyEmail = companyEmail ? escapeHtml(companyEmail) : ''
  const safeLogoUrl = logoUrl ? escapeHtml(logoUrl) : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
    <div style="background:#f97316;padding:24px 32px">
      ${safeLogoUrl ? `<img src="${safeLogoUrl}" alt="${safeCompanyName}" style="max-height:32px;max-width:200px;display:block" />` : `<p style="margin:0;color:#ffffff;font-size:20px;font-weight:700">${safeCompanyName}</p>`}
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;color:#374151">Hi ${safeCustomerName},</p>
      <p style="margin:0 0 24px;color:#6b7280">
        You can now view your jobs and invoices with ${safeCompanyName} online. Click the button below to open your customer portal.
      </p>
      <a href="${safePortalUrl}" style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">View your jobs &amp; invoices &rarr;</a>
      <p style="margin:24px 0 0;font-size:13px;color:#9ca3af">This link is valid for 30 days. If it expires, request a new portal link.</p>
      <p style="margin:16px 0 0;font-size:13px;color:#9ca3af">
        Questions? Reply to this email${safeCompanyPhone ? ` or call ${safeCompanyPhone}` : ''}.
      </p>
    </div>
    <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${safeCompanyName}${safeCompanyEmail ? ` &middot; ${safeCompanyEmail}` : ''} &middot; Powered by IndustryForms</p>
    </div>
  </div>
</body>
</html>`
}
