const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID!
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET!
const XERO_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/xero/callback`

const XERO_SCOPES = 'openid profile email accounting.transactions accounting.contacts offline_access'

export function getXeroAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: XERO_CLIENT_ID,
    redirect_uri: XERO_REDIRECT_URI,
    scope: XERO_SCOPES,
    state,
  })
  return `https://login.xero.com/identity/connect/authorize?${params}`
}

export async function exchangeXeroCode(code: string) {
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: XERO_REDIRECT_URI }),
  })
  if (!res.ok) throw new Error('Failed to exchange Xero code')
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

export async function refreshXeroToken(refreshToken: string) {
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) throw new Error('Failed to refresh Xero token')
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

export async function getXeroTenants(accessToken: string): Promise<Array<{ tenantId: string; tenantName: string }>> {
  const res = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error('Failed to get Xero tenants')
  const data = await res.json()
  return data.map((c: { tenantId: string; tenantName: string }) => ({ tenantId: c.tenantId, tenantName: c.tenantName }))
}

export async function xeroRequest(path: string, tenantId: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.xero.com/api.xro/2.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...((options.headers ?? {}) as Record<string, string>),
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero API error ${res.status}: ${body}`)
  }
  return res.json()
}

// Xero rejects a contact Name that duplicates an existing one — so a plain
// create-every-time would work for exactly one invoice per customer and then
// hard-fail on the very next one. Look the contact up first and reuse it;
// only create when nothing matches. (Matches on exact Name — the same
// constraint Xero itself enforces, so no separate contact could exist with
// that name anyway.)
async function findOrCreateXeroContact(
  tenantId: string,
  accessToken: string,
  customer: { name: string; email: string | null }
): Promise<string | undefined> {
  const clause = `Name=="${customer.name.replace(/"/g, '\\"')}"`
  const found = await xeroRequest(`/Contacts?where=${encodeURIComponent(clause)}`, tenantId, accessToken)
  const existing = found.Contacts?.[0]?.ContactID
  if (existing) return existing

  const created = await xeroRequest('/Contacts', tenantId, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      Contacts: [{ Name: customer.name, EmailAddress: customer.email ?? undefined }],
    }),
  })
  return created.Contacts?.[0]?.ContactID
}

// Tax type codes are org-specific (NZ and AU Xero orgs don't even share the
// same built-in code names, and an org can customise its own tax rates) —
// hardcoding one code silently mis-taxes or outright fails depending on the
// connected org. Ask Xero what it actually has configured and match each
// line's own rate to it, rather than guessing.
async function loadXeroTaxTypesByRate(tenantId: string, accessToken: string): Promise<Array<{ TaxType: string; DisplayTaxRate: number }>> {
  const data = await xeroRequest('/TaxRates', tenantId, accessToken)
  const rates = (data.TaxRates ?? []) as Array<{ TaxType: string; DisplayTaxRate: number; Status: string; CanApplyToRevenue: boolean }>
  return rates.filter(r => r.Status === 'ACTIVE' && r.CanApplyToRevenue)
}

export function pickXeroTaxType(rates: Array<{ TaxType: string; DisplayTaxRate: number }>, ratePercent: number): string {
  const match = rates.find(r => Math.abs(r.DisplayTaxRate - ratePercent) < 0.01)
  if (match) return match.TaxType
  // No rate configured on the org matches exactly (e.g. a custom rate that
  // was never added in Xero) — fall back to the org's zero-rate type for a
  // 0% line, else just its first revenue rate, rather than failing outright.
  if (ratePercent === 0) return rates.find(r => r.DisplayTaxRate === 0)?.TaxType ?? 'NONE'
  return rates[0]?.TaxType ?? 'NONE'
}

export async function syncInvoiceToXero({
  accessToken,
  tenantId,
  invoice,
  customer,
  gstRate,
}: {
  accessToken: string
  tenantId: string
  invoice: {
    id: string
    invoice_number: string
    external_id?: string | null
    date?: string | null
    due_date: string | null
    subtotal: number
    gst_amount: number
    total: number
    notes: string | null
    invoice_line_items: Array<{ description: string; quantity: number; unit_price: number; line_total: number; tax_rate: number | null }>
  }
  customer: { name: string; email: string | null }
  gstRate: number
}) {
  const contactId = await findOrCreateXeroContact(tenantId, accessToken, customer)
  const taxRates = await loadXeroTaxTypesByRate(tenantId, accessToken)

  // Create/update invoice — including the existing Xero InvoiceID (when this
  // invoice has already been synced once) makes this an update in place,
  // instead of POSTing a second, duplicate invoice every re-sync.
  const xeroInvoice = {
    ...(invoice.external_id ? { InvoiceID: invoice.external_id } : {}),
    Type: 'ACCREC',
    Contact: { ContactID: contactId },
    InvoiceNumber: invoice.invoice_number,
    Date: invoice.date ? invoice.date.split('T')[0] : undefined,
    DueDate: invoice.due_date ? invoice.due_date.split('T')[0] : undefined,
    LineAmountTypes: 'EXCLUSIVE',
    LineItems: invoice.invoice_line_items.map(l => ({
      Description: l.description,
      Quantity: Number(l.quantity),
      UnitAmount: Number(l.unit_price),
      TaxType: pickXeroTaxType(taxRates, Number((l.tax_rate ?? gstRate) * 100)),
    })),
    Reference: invoice.id,
  }

  const res = await xeroRequest('/Invoices', tenantId, accessToken, {
    method: 'POST',
    body: JSON.stringify({ Invoices: [xeroInvoice] }),
  })

  return res.Invoices?.[0]?.InvoiceID as string | undefined
}
