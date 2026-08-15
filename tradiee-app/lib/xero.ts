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
// Escape order matters: a literal backslash must become \\ before a quote
// becomes \" — otherwise a name ending in a bare backslash (e.g. "Smith \")
// would pair with the closing quote's escape and never actually close the
// string literal in Xero's where-clause grammar.
export function xeroWhereNameClause(name: string): string {
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `Name=="${escaped}"`
}

async function findOrCreateXeroContact(
  tenantId: string,
  accessToken: string,
  customer: { name: string; email: string | null }
): Promise<string | undefined> {
  const clause = xeroWhereNameClause(customer.name)
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

// Pushes a credit note as a Xero ACCRECCREDIT (Accounts Receivable Credit
// Note) — the accounting-correct counterpart to ACCREC invoices, distinct
// from a plain negative invoice. Manually triggered from the credit note's
// own "Sync to Xero" action, same as syncInvoiceToXero — this app never
// auto-syncs to Xero in the background.
//
// A single line item ("Credit note reference: <source invoice number>")
// rather than copying the source invoice's line items — the credit note
// isn't crediting specific goods/services, it's crediting an amount, and a
// single line keeps that unambiguous in Xero's UI.
export async function syncCreditNoteToXero({ accessToken, tenantId, creditNote, customer, gstRate }: {
  accessToken: string
  tenantId: string
  creditNote: {
    id: string
    credit_note_number: string
    external_id?: string | null
    date: string | null
    amount: number
    source_invoice_number: string
    reason: string | null
  }
  customer: { name: string; email: string | null }
  gstRate: number
}): Promise<string | undefined> {
  const contactId = await findOrCreateXeroContact(tenantId, accessToken, customer)
  const taxRates = await loadXeroTaxTypesByRate(tenantId, accessToken)

  const xeroCreditNote = {
    ...(creditNote.external_id ? { CreditNoteID: creditNote.external_id } : {}),
    Type: 'ACCRECCREDIT',
    Contact: { ContactID: contactId },
    CreditNoteNumber: creditNote.credit_note_number,
    Date: creditNote.date ? creditNote.date.split('T')[0] : undefined,
    LineAmountTypes: 'INCLUSIVE', // creditNote.amount is GST-inclusive, the customer-facing figure
    LineItems: [{
      Description: creditNote.reason
        ? `Credit note: ${creditNote.reason} (ref. invoice ${creditNote.source_invoice_number})`
        : `Credit note (ref. invoice ${creditNote.source_invoice_number})`,
      Quantity: 1,
      UnitAmount: Number(creditNote.amount),
      TaxType: pickXeroTaxType(taxRates, gstRate * 100),
    }],
    Reference: creditNote.id,
  }

  const res = await xeroRequest('/CreditNotes', tenantId, accessToken, {
    method: 'POST',
    body: JSON.stringify({ CreditNotes: [xeroCreditNote] }),
  })

  return res.CreditNotes?.[0]?.CreditNoteID as string | undefined
}

// Allocates a portion of an already-synced Xero credit note against an
// already-synced Xero invoice — the Xero-native equivalent of a
// credit_note_applications row. Both sides must already have a Xero
// InvoiceID/CreditNoteID; the caller checks this and skips the Xero side
// (while still recording the application locally) when either is missing —
// applying account credit shouldn't be blocked on both documents happening
// to already be synced.
export async function allocateXeroCreditNote({ accessToken, tenantId, xeroCreditNoteId, xeroInvoiceId, amount, date }: {
  accessToken: string
  tenantId: string
  xeroCreditNoteId: string
  xeroInvoiceId: string
  amount: number
  date: string
}): Promise<void> {
  await xeroRequest(`/CreditNotes/${xeroCreditNoteId}/Allocations`, tenantId, accessToken, {
    method: 'PUT',
    body: JSON.stringify({
      Allocations: [{
        Invoice: { InvoiceID: xeroInvoiceId },
        Amount: amount,
        Date: date.split('T')[0],
      }],
    }),
  })
}
