// Server-safe: rendered via renderToBuffer() in app/api/quotes/[id]/pdf/route.ts
// AND client-side (react-pdf's own renderer, not React DOM) via print-quote.tsx's
// pdf(<QuotePdf/>) — no 'use client' directive here, same reasoning as
// statement-pdf.tsx and invoice-pdf.tsx (see the comment on the latter for the
// exact trap: 'use client' hands the server route a client-reference proxy
// instead of the real component, crashing renderToBuffer()).
//
// Deliberately mirrors invoice-pdf.tsx's layout — same document, different
// content in the places a quote genuinely differs from an invoice: no
// payment-due/amount-paid concept, and the bottom info block is the quote's
// own terms/customer-message instead of bank details/payment terms.
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { DEFAULT_TIMEZONE, formatDate } from '@/lib/datetime'
import { quoteLabel } from '@/lib/utils'

const ORANGE = '#f97316'
const GREY = '#6b7280'
const LIGHT = '#f3f4f6'
const BORDER = '#e5e7eb'
const DARK = '#111827'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, padding: 36, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: ORANGE, marginBottom: 16 },
  logo: { width: 90, height: 42, objectFit: 'contain', marginBottom: 6 },
  companyName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: DARK },
  muted: { color: GREY, fontSize: 8, marginTop: 2 },
  label: { fontSize: 7, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  docNo: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: ORANGE },
  fieldGrid: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  fieldBox: { flex: 1, backgroundColor: LIGHT, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 10 },
  fieldLabel: { fontSize: 6.5, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  fieldValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', gap: 20, marginBottom: 18 },
  col: { flex: 1 },
  sectionTitle: { fontSize: 7, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3 },
  value: { fontSize: 9, lineHeight: 1.4 },
  tableHead: { flexDirection: 'row', backgroundColor: LIGHT, paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LIGHT },
  tableRowAlt: { backgroundColor: '#fafafa' },
  th: { fontSize: 7, color: GREY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  td: { fontSize: 8.5 },
  totals: { marginTop: 12, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', gap: 18, marginBottom: 4 },
  totalLabel: { width: 130, textAlign: 'right', color: GREY },
  totalValue: { width: 75, textAlign: 'right' },
  grand: { flexDirection: 'row', gap: 18, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: ORANGE, marginTop: 4 },
  grandLabel: { width: 130, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  grandValue: { width: 75, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 11, color: ORANGE },
  sigRow: { flexDirection: 'row', gap: 30, marginTop: 32 },
  sigBox: { flex: 1, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6 },
  sigLabel: { fontSize: 7.5, color: GREY },
  sigSpacer: { height: 26 },
  bottomGrid: { flexDirection: 'row', gap: 24, marginTop: 24 },
  bottomCol: { flex: 1 },
  bottomHeading: { fontSize: 7, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  bottomText: { fontSize: 7.5, color: GREY, lineHeight: 1.5 },
  watermark: { textAlign: 'center', fontSize: 7, color: GREY, marginTop: 18 },
})

function fmt(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString('en-NZ', { style: 'currency', currency: 'NZD' })
}

function fmtDate(iso: string | null | undefined, timezone: string) {
  if (!iso) return ''
  return formatDate(iso, timezone, { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface QuotePdfData {
  quote: {
    quote_number: string
    is_estimate?: boolean | null
    created_at: string
    expires_at: string | null
    subtotal: number
    discount_amount: number
    gst_amount: number
    total: number
    reference?: string | null
    customer_message?: string | null
    terms?: string | null
    customers?: { name: string; email?: string | null; billing_address?: string | null } | null
    lines: Array<{ id: string; description: string; quantity: number; unit: string; unit_price: number; line_total: number }>
  }
  company: { name: string; email?: string | null; phone?: string | null; gst_number?: string | null; logo_url?: string | null; isFreePlan?: boolean }
  timezone?: string
}

export function QuotePdf({ data }: { data: QuotePdfData }) {
  const timezone = data.timezone ?? DEFAULT_TIMEZONE
  const docWord = quoteLabel(data.quote.is_estimate)
  const preTax = Number(data.quote.subtotal) - Number(data.quote.discount_amount ?? 0)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {data.company.logo_url ? <Image style={s.logo} src={data.company.logo_url} /> : null}
            <Text style={s.companyName}>{data.company.name}</Text>
            {data.company.email ? <Text style={s.muted}>{data.company.email}</Text> : null}
            {data.company.phone ? <Text style={s.muted}>{data.company.phone}</Text> : null}
            {data.company.gst_number ? <Text style={s.muted}>GST {data.company.gst_number}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.label}>{docWord}</Text>
            <Text style={s.docNo}>#{data.quote.quote_number}</Text>
          </View>
        </View>

        <View style={s.fieldGrid}>
          <View style={s.fieldBox}>
            <Text style={s.fieldLabel}>Date of {docWord.toLowerCase()}</Text>
            <Text style={s.fieldValue}>{fmtDate(data.quote.created_at, timezone) || '—'}</Text>
          </View>
          <View style={s.fieldBox}>
            <Text style={s.fieldLabel}>{docWord} No.</Text>
            <Text style={s.fieldValue}>{data.quote.quote_number}</Text>
          </View>
          <View style={s.fieldBox}>
            <Text style={s.fieldLabel}>Valid until</Text>
            <Text style={s.fieldValue}>{fmtDate(data.quote.expires_at, timezone) || '—'}</Text>
          </View>
        </View>

        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.sectionTitle}>Client</Text>
            <Text style={s.value}>{data.quote.customers?.name ?? ''}</Text>
            {data.quote.customers?.billing_address ? <Text style={s.value}>{data.quote.customers.billing_address}</Text> : null}
            {data.quote.customers?.email ? <Text style={s.value}>{data.quote.customers.email}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.sectionTitle}>Reference</Text>
            <Text style={s.value}>{data.quote.reference ?? ''}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, { width: 20 }]}>#</Text>
          <Text style={[s.th, { flex: 1 }]}>Description</Text>
          <Text style={[s.th, { width: 55, textAlign: 'right' }]}>Qty</Text>
          <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Unit price</Text>
          <Text style={[s.th, { width: 85, textAlign: 'right' }]}>Total</Text>
        </View>
        {data.quote.lines.map((line, i) => (
          <View key={line.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <Text style={[s.td, { width: 20, color: GREY }]}>{i + 1}</Text>
            <Text style={[s.td, { flex: 1 }]}>{line.description}</Text>
            <Text style={[s.td, { width: 55, textAlign: 'right' }]}>{line.quantity} {line.unit}</Text>
            <Text style={[s.td, { width: 80, textAlign: 'right' }]}>{fmt(line.unit_price)}</Text>
            <Text style={[s.td, { width: 85, textAlign: 'right' }]}>{fmt(line.line_total)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Total before discount</Text><Text style={s.totalValue}>{fmt(data.quote.subtotal)}</Text></View>
          {Number(data.quote.discount_amount) > 0 ? (
            <>
              <View style={s.totalRow}><Text style={s.totalLabel}>Total discount</Text><Text style={s.totalValue}>-{fmt(data.quote.discount_amount)}</Text></View>
              <View style={s.totalRow}><Text style={s.totalLabel}>Total before tax</Text><Text style={s.totalValue}>{fmt(preTax)}</Text></View>
            </>
          ) : null}
          <View style={s.totalRow}><Text style={s.totalLabel}>Total tax</Text><Text style={s.totalValue}>{fmt(data.quote.gst_amount)}</Text></View>
          <View style={s.grand}><Text style={s.grandLabel}>Total</Text><Text style={s.grandValue}>{fmt(data.quote.total)}</Text></View>
        </View>

        <View style={s.sigRow}>
          <View style={s.sigBox}>
            <View style={s.sigSpacer} />
            <Text style={s.sigLabel}>Customer signature</Text>
            <Text style={{ fontSize: 7.5, color: GREY, marginTop: 2 }}>Date: _____________</Text>
          </View>
          <View style={s.sigBox}>
            <View style={s.sigSpacer} />
            <Text style={s.sigLabel}>Authorized signature</Text>
            <Text style={{ fontSize: 7.5, color: GREY, marginTop: 2 }}>Date: _____________</Text>
          </View>
        </View>

        <View style={s.bottomGrid}>
          {data.quote.customer_message ? (
            <View style={s.bottomCol}>
              <Text style={s.bottomHeading}>Message</Text>
              <Text style={s.bottomText}>{data.quote.customer_message}</Text>
            </View>
          ) : null}
          <View style={s.bottomCol}>
            <Text style={s.bottomHeading}>Terms &amp; conditions</Text>
            <Text style={s.bottomText}>{data.quote.terms ?? `This ${docWord.toLowerCase()} is valid until the date shown above. Prices may change after this date.`}</Text>
          </View>
        </View>

        {data.company.isFreePlan ? <Text style={s.watermark}>Powered by www.industryforms.app</Text> : null}
      </Page>
    </Document>
  )
}
