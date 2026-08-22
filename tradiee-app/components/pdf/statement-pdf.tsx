// Server-only: rendered via renderToBuffer() from lib/pdf/render-statement.ts,
// never in-browser (unlike invoice-pdf.tsx, which print-invoice.tsx also
// renders client-side) — no 'use client' directive needed or wanted here.
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { DEFAULT_TIMEZONE, formatDate } from '@/lib/datetime'
import type { CustomerStatement } from '@/lib/statement'

const ORANGE = '#f97316'
const GREY = '#6b7280'
const LIGHT = '#f3f4f6'
const BORDER = '#e5e7eb'
const DARK = '#111827'
const RED = '#dc2626'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, padding: 36, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: ORANGE, marginBottom: 16 },
  logo: { width: 90, height: 42, objectFit: 'contain', marginBottom: 6 },
  companyName: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: DARK },
  muted: { color: GREY, fontSize: 8, marginTop: 2 },
  label: { fontSize: 7, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: ORANGE },
  row: { flexDirection: 'row', gap: 20, marginBottom: 18 },
  col: { flex: 1 },
  sectionTitle: { fontSize: 7, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3 },
  value: { fontSize: 9, lineHeight: 1.4 },
  agingGrid: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  agingBox: { flex: 1, backgroundColor: LIGHT, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 10 },
  agingLabel: { fontSize: 6.5, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  agingValue: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  tableHead: { flexDirection: 'row', backgroundColor: LIGHT, paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LIGHT },
  tableRowAlt: { backgroundColor: '#fafafa' },
  th: { fontSize: 7, color: GREY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  td: { fontSize: 8.5 },
  totals: { marginTop: 12, alignItems: 'flex-end' },
  grand: { flexDirection: 'row', gap: 18, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: ORANGE, marginTop: 4 },
  grandLabel: { width: 130, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  grandValue: { width: 75, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 11, color: ORANGE },
})

function fmt(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD' })
}

function fmtDate(iso: string | null | undefined, timezone: string) {
  if (!iso) return '—'
  return formatDate(iso, timezone, { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface StatementPdfData {
  customer: { name: string; email?: string | null; billing_address?: string | null }
  statement: CustomerStatement
  company: { name: string; email?: string | null; phone?: string | null; gst_number?: string | null; logo_url?: string | null }
  timezone?: string
  asOf: string
}

export function StatementPdf({ data }: { data: StatementPdfData }) {
  const timezone = data.timezone ?? DEFAULT_TIMEZONE
  const lines = [...data.statement.lines].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            {/* react-pdf's Image (not next/image or <img>) has no alt prop — this
                renders into a PDF document, not the DOM, so alt-text doesn't apply. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {data.company.logo_url ? <Image style={s.logo} src={data.company.logo_url} /> : null}
            <Text style={s.companyName}>{data.company.name}</Text>
            {data.company.email ? <Text style={s.muted}>{data.company.email}</Text> : null}
            {data.company.phone ? <Text style={s.muted}>{data.company.phone}</Text> : null}
            {data.company.gst_number ? <Text style={s.muted}>GST {data.company.gst_number}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.label}>Statement of Account</Text>
            <Text style={s.docTitle}>as at {fmtDate(data.asOf, timezone)}</Text>
          </View>
        </View>

        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.sectionTitle}>Customer</Text>
            <Text style={s.value}>{data.customer.name}</Text>
            {data.customer.billing_address ? <Text style={s.value}>{data.customer.billing_address}</Text> : null}
            {data.customer.email ? <Text style={s.value}>{data.customer.email}</Text> : null}
          </View>
        </View>

        <View style={s.agingGrid}>
          <View style={s.agingBox}><Text style={s.agingLabel}>Current</Text><Text style={s.agingValue}>{fmt(data.statement.current)}</Text></View>
          <View style={s.agingBox}><Text style={s.agingLabel}>1-30 days</Text><Text style={s.agingValue}>{fmt(data.statement.d30)}</Text></View>
          <View style={s.agingBox}><Text style={s.agingLabel}>31-60 days</Text><Text style={s.agingValue}>{fmt(data.statement.d60)}</Text></View>
          <View style={[s.agingBox, data.statement.d90 > 0 ? { backgroundColor: '#fef2f2' } : {}]}>
            <Text style={s.agingLabel}>61+ days</Text>
            <Text style={[s.agingValue, data.statement.d90 > 0 ? { color: RED } : {}]}>{fmt(data.statement.d90)}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>Invoice</Text>
          <Text style={[s.th, { width: 80 }]}>Date</Text>
          <Text style={[s.th, { width: 80 }]}>Due date</Text>
          <Text style={[s.th, { width: 85, textAlign: 'right' }]}>Total</Text>
          <Text style={[s.th, { width: 85, textAlign: 'right' }]}>Balance</Text>
        </View>
        {lines.map((line, i) => (
          <View key={line.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <Text style={[s.td, { flex: 1 }]}>{line.invoice_number}</Text>
            <Text style={[s.td, { width: 80 }]}>{fmtDate(line.date, timezone)}</Text>
            <Text style={[s.td, { width: 80 }]}>{fmtDate(line.due_date, timezone)}</Text>
            <Text style={[s.td, { width: 85, textAlign: 'right' }]}>{fmt(line.total)}</Text>
            <Text style={[s.td, { width: 85, textAlign: 'right' }]}>{fmt(line.balance)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.grand}><Text style={s.grandLabel}>Total outstanding</Text><Text style={s.grandValue}>{fmt(data.statement.outstanding)}</Text></View>
        </View>
      </Page>
    </Document>
  )
}
