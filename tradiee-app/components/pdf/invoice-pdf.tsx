'use client'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const ORANGE = '#f97316'
const GREY = '#6b7280'
const LIGHT = '#f3f4f6'
const BORDER = '#e5e7eb'
const DARK = '#111827'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, padding: 36, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: ORANGE, marginBottom: 20 },
  companyName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: ORANGE },
  muted: { color: GREY, fontSize: 8, marginTop: 2 },
  label: { fontSize: 7, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  invoiceNo: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: ORANGE },
  row: { flexDirection: 'row', gap: 20, marginBottom: 18 },
  col: { flex: 1 },
  sectionTitle: { fontSize: 7, color: GREY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 6, borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 3 },
  value: { fontSize: 9, lineHeight: 1.4 },
  tableHead: { flexDirection: 'row', backgroundColor: LIGHT, paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LIGHT },
  th: { fontSize: 7, color: GREY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  td: { fontSize: 8.5 },
  totals: { marginTop: 12, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', gap: 18, marginBottom: 4 },
  totalLabel: { width: 120, textAlign: 'right', color: GREY },
  totalValue: { width: 75, textAlign: 'right' },
  grand: { flexDirection: 'row', gap: 18, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: ORANGE, marginTop: 4 },
  grandLabel: { width: 120, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 11 },
  grandValue: { width: 75, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 11, color: ORANGE },
  footer: { position: 'absolute', bottom: 28, left: 36, right: 36, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6, color: GREY, fontSize: 7 },
})

function fmt(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString('en-NZ', { style: 'currency', currency: 'NZD' })
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

export interface InvoicePdfData {
  invoice: {
    invoice_number: string
    invoice_date?: string | null
    due_date: string | null
    subtotal: number
    discount_amount: number
    gst_amount: number
    total: number
    amount_paid: number
    payment_instructions?: string | null
    invoice_footer?: string | null
    customers?: { name: string; email?: string | null; billing_address?: string | null } | null
    jobs?: { job_number: string; title: string } | null
    invoice_line_items?: Array<{ id: string; description: string; quantity: number; unit: string; unit_price: number; line_total: number }>
  }
  company: { name: string; email?: string | null; phone?: string | null; gst_number?: string | null }
}

export function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const lines = [...(data.invoice.invoice_line_items ?? [])]
  const balance = Number(data.invoice.total) - Number(data.invoice.amount_paid ?? 0)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.companyName}>{data.company.name}</Text>
            {data.company.email ? <Text style={s.muted}>{data.company.email}</Text> : null}
            {data.company.phone ? <Text style={s.muted}>{data.company.phone}</Text> : null}
            {data.company.gst_number ? <Text style={s.muted}>GST {data.company.gst_number}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.label}>Invoice</Text>
            <Text style={s.invoiceNo}>{data.invoice.invoice_number}</Text>
            {data.invoice.invoice_date ? <Text style={s.muted}>Date {fmtDate(data.invoice.invoice_date)}</Text> : null}
            {data.invoice.due_date ? <Text style={s.muted}>Due {fmtDate(data.invoice.due_date)}</Text> : null}
          </View>
        </View>

        <View style={s.row}>
          <View style={s.col}>
            <Text style={s.sectionTitle}>Bill to</Text>
            <Text style={s.value}>{data.invoice.customers?.name ?? ''}</Text>
            {data.invoice.customers?.billing_address ? <Text style={s.value}>{data.invoice.customers.billing_address}</Text> : null}
            {data.invoice.customers?.email ? <Text style={s.value}>{data.invoice.customers.email}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.sectionTitle}>Job</Text>
            <Text style={s.value}>{data.invoice.jobs ? `${data.invoice.jobs.job_number} - ${data.invoice.jobs.title}` : ''}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>Description</Text>
          <Text style={[s.th, { width: 55, textAlign: 'right' }]}>Qty</Text>
          <Text style={[s.th, { width: 80, textAlign: 'right' }]}>Unit</Text>
          <Text style={[s.th, { width: 85, textAlign: 'right' }]}>Total</Text>
        </View>
        {lines.map(line => (
          <View key={line.id} style={s.tableRow}>
            <Text style={[s.td, { flex: 1 }]}>{line.description}</Text>
            <Text style={[s.td, { width: 55, textAlign: 'right' }]}>{line.quantity} {line.unit}</Text>
            <Text style={[s.td, { width: 80, textAlign: 'right' }]}>{fmt(line.unit_price)}</Text>
            <Text style={[s.td, { width: 85, textAlign: 'right' }]}>{fmt(line.line_total)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.totalRow}><Text style={s.totalLabel}>Subtotal</Text><Text style={s.totalValue}>{fmt(data.invoice.subtotal)}</Text></View>
          {Number(data.invoice.discount_amount) > 0 ? <View style={s.totalRow}><Text style={s.totalLabel}>Discount</Text><Text style={s.totalValue}>-{fmt(data.invoice.discount_amount)}</Text></View> : null}
          <View style={s.totalRow}><Text style={s.totalLabel}>GST</Text><Text style={s.totalValue}>{fmt(data.invoice.gst_amount)}</Text></View>
          <View style={s.grand}><Text style={s.grandLabel}>Total</Text><Text style={s.grandValue}>{fmt(data.invoice.total)}</Text></View>
          {Number(data.invoice.amount_paid) > 0 ? <View style={s.totalRow}><Text style={s.totalLabel}>Balance due</Text><Text style={s.totalValue}>{fmt(balance)}</Text></View> : null}
        </View>

        {data.invoice.payment_instructions ? <Text style={{ marginTop: 22, fontSize: 8, color: GREY }}>{data.invoice.payment_instructions}</Text> : null}
        <Text style={s.footer}>{data.invoice.invoice_footer ?? 'Thank you for your business.'}</Text>
      </Page>
    </Document>
  )
}
