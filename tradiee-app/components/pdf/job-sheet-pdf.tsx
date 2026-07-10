'use client'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { DEFAULT_TIMEZONE, formatDate, formatDateTime } from '@/lib/datetime'

const ORANGE = '#f97316'
const GREY   = '#6b7280'
const LIGHT  = '#f3f4f6'
const BORDER = '#e5e7eb'
const DARK   = '#111827'

const s = StyleSheet.create({
  page:         { fontFamily: 'Helvetica', fontSize: 9, color: DARK, padding: 36, backgroundColor: '#fff' },
  // Header
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: ORANGE },
  headerLeft:   { flex: 1 },
  logo:         { maxWidth: 120, maxHeight: 36, marginBottom: 5, objectFit: 'contain' },
  companyName:  { fontSize: 18, fontFamily: 'Helvetica-Bold', color: ORANGE },
  companyMeta:  { fontSize: 7.5, color: GREY, marginTop: 1.5 },
  headerRight:  { alignItems: 'flex-end' },
  docLabel:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  jobNum:       { fontSize: 22, fontFamily: 'Helvetica-Bold', color: ORANGE },
  jobDate:      { fontSize: 7.5, color: GREY, marginTop: 3 },
  statusBadge:  { marginTop: 5, backgroundColor: ORANGE, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusText:   { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  // Section title
  sectionTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: BORDER },
  row2:         { flexDirection: 'row', gap: 14, marginBottom: 14 },
  col:          { flex: 1 },
  field:        { marginBottom: 4 },
  label:        { fontSize: 7, color: GREY, marginBottom: 1 },
  value:        { fontSize: 9, color: DARK },
  // Description
  desc:         { marginBottom: 14 },
  descText:     { fontSize: 9, color: '#374151', lineHeight: 1.5 },
  // Table
  tableHead:    { flexDirection: 'row', backgroundColor: LIGHT, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 1 },
  tableRow:     { flexDirection: 'row', paddingVertical: 4.5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: LIGHT },
  tableRowAlt:  { backgroundColor: '#fafafa' },
  th:           { fontSize: 7, fontFamily: 'Helvetica-Bold', color: GREY, textTransform: 'uppercase', letterSpacing: 0.3 },
  td:           { fontSize: 8.5 },
  // Totals
  totalBox:     { marginTop: 10, alignItems: 'flex-end' },
  totalRow:     { flexDirection: 'row', gap: 14, marginBottom: 3 },
  totalLabel:   { fontSize: 9, color: GREY, width: 120, textAlign: 'right' },
  totalValue:   { fontSize: 9, width: 65, textAlign: 'right' },
  grandTotal:   { flexDirection: 'row', gap: 14, paddingTop: 6, borderTopWidth: 1.5, borderTopColor: ORANGE, marginTop: 4 },
  grandLabel:   { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 120, textAlign: 'right' },
  grandValue:   { fontSize: 11, fontFamily: 'Helvetica-Bold', width: 65, textAlign: 'right', color: ORANGE },
  // Signature boxes
  sigRow:       { flexDirection: 'row', gap: 20, marginTop: 28 },
  sigBox:       { flex: 1, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6 },
  sigLabel:     { fontSize: 7.5, color: GREY },
  sigSpacer:    { height: 28 },
  // Footer
  footer:       { position: 'absolute', bottom: 28, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6 },
  footerText:   { fontSize: 7, color: GREY },
})

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string | null | undefined, timezone: string) {
  if (!iso) return '—'
  return formatDate(iso, timezone, { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtDateTime(iso: string | null | undefined, timezone: string) {
  if (!iso) return '—'
  return formatDateTime(iso, timezone, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export interface JobSheetData {
  job: {
    id: string
    job_number: string
    title: string
    status: string
    description: string | null
    created_at: string
    tags: string[] | null
    customers: { name: string; email: string | null; phone: string | null } | null
    customer_sites: { address: string } | null
    profiles: { full_name: string } | null
    quotes: { quote_number: string } | null
  }
  visits: Array<{
    scheduled_start: string
    scheduled_end: string
    status: string
    notes: string | null
    profiles: { full_name: string } | null
  }>
  lineItems: Array<{
    description: string
    quantity: number
    unit: string
    unit_price: number
  }>
  timesheets: Array<{
    started_at: string
    ended_at: string | null
    bill_rate: number | null
    is_billable: boolean
    profiles: { full_name: string } | null
  }>
  notes: Array<{
    body: string
    created_at: string
    profiles: { full_name: string } | null
  }>
  company: {
    name: string
    phone: string | null
    email: string | null
    address: string | null
    logo_url: string | null
    gst_number: string | null
    default_gst_rate: number
  }
  timezone?: string
}

export function JobSheetPdf({ data }: { data: JobSheetData }) {
  const { job, visits, lineItems, timesheets, notes, company } = data
  const timezone = data.timezone ?? DEFAULT_TIMEZONE
  const gstRate = company.default_gst_rate ?? 0.15

  const lineSubtotal = lineItems.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0)
  const labourSubtotal = timesheets
    .filter(t => t.is_billable && t.bill_rate && t.ended_at)
    .reduce((sum, t) => {
      const hrs = (new Date(t.ended_at!).getTime() - new Date(t.started_at).getTime()) / 3600000
      return sum + hrs * Number(t.bill_rate)
    }, 0)
  const subtotal = lineSubtotal + labourSubtotal
  const gst = subtotal * gstRate
  const total = subtotal + gst
  const showTotals = subtotal > 0

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {company.logo_url ? <Image style={s.logo} src={company.logo_url} /> : null}
            {company.name ? <Text style={s.companyName}>{company.name}</Text> : null}
            {company.address ? <Text style={s.companyMeta}>{company.address}</Text> : null}
            {company.phone   ? <Text style={s.companyMeta}>{company.phone}</Text> : null}
            {company.email   ? <Text style={s.companyMeta}>{company.email}</Text> : null}
            {company.gst_number ? <Text style={s.companyMeta}>GST No: {company.gst_number}</Text> : null}
          </View>
          <View style={s.headerRight}>
            <Text style={s.docLabel}>Job Sheet</Text>
            <Text style={s.jobNum}>{job.job_number}</Text>
            <Text style={s.jobDate}>Date: {fmtDate(job.created_at, timezone)}</Text>
            <View style={s.statusBadge}>
              <Text style={s.statusText}>{job.status.replace(/_/g, ' ')}</Text>
            </View>
          </View>
        </View>

        {/* ── Job title ── */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 }}>{job.title}</Text>
          {job.quotes ? <Text style={{ fontSize: 7.5, color: GREY }}>Quote: {job.quotes.quote_number}</Text> : null}
        </View>

        {/* ── Customer + Site ── */}
        <View style={s.row2}>
          <View style={s.col}>
            <Text style={s.sectionTitle}>Customer</Text>
            {job.customers ? (
              <>
                <View style={s.field}><Text style={s.label}>Name</Text><Text style={s.value}>{job.customers.name}</Text></View>
                {job.customers.phone ? <View style={s.field}><Text style={s.label}>Phone</Text><Text style={s.value}>{job.customers.phone}</Text></View> : null}
                {job.customers.email ? <View style={s.field}><Text style={s.label}>Email</Text><Text style={s.value}>{job.customers.email}</Text></View> : null}
              </>
            ) : <Text style={s.value}>—</Text>}
          </View>
          <View style={s.col}>
            <Text style={s.sectionTitle}>Site / Location</Text>
            {job.customer_sites ? (
              <View style={s.field}><Text style={s.label}>Address</Text><Text style={s.value}>{job.customer_sites.address}</Text></View>
            ) : <Text style={{ fontSize: 9, color: GREY }}>No site specified</Text>}
            {job.profiles ? (
              <View style={s.field}><Text style={s.label}>Assigned to</Text><Text style={s.value}>{job.profiles.full_name}</Text></View>
            ) : null}
            {job.tags && job.tags.length > 0 ? (
              <View style={s.field}><Text style={s.label}>Tags</Text><Text style={s.value}>{job.tags.join(', ')}</Text></View>
            ) : null}
          </View>
        </View>

        {/* ── Description ── */}
        {job.description ? (
          <View style={[s.desc, { marginBottom: 14 }]}>
            <Text style={s.sectionTitle}>Description of Work</Text>
            <Text style={s.descText}>{job.description}</Text>
          </View>
        ) : null}

        {/* ── Scheduled Visits ── */}
        {visits.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.sectionTitle}>Scheduled Visits</Text>
            <View style={s.tableHead}>
              <Text style={[s.th, { width: 110 }]}>Start</Text>
              <Text style={[s.th, { width: 110 }]}>End</Text>
              <Text style={[s.th, { flex: 1 }]}>Assigned to</Text>
              <Text style={[s.th, { width: 60 }]}>Status</Text>
            </View>
            {visits.map((v, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.td, { width: 110 }]}>{fmtDateTime(v.scheduled_start, timezone)}</Text>
                <Text style={[s.td, { width: 110 }]}>{fmtDateTime(v.scheduled_end, timezone)}</Text>
                <Text style={[s.td, { flex: 1 }]}>{v.profiles?.full_name ?? 'Unassigned'}</Text>
                <Text style={[s.td, { width: 60, color: GREY }]}>{v.status}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Line Items ── */}
        {lineItems.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.sectionTitle}>Materials &amp; Services</Text>
            <View style={s.tableHead}>
              <Text style={[s.th, { flex: 1 }]}>Description</Text>
              <Text style={[s.th, { width: 30 }]}>Qty</Text>
              <Text style={[s.th, { width: 35 }]}>Unit</Text>
              <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Rate</Text>
              <Text style={[s.th, { width: 65, textAlign: 'right' }]}>Total</Text>
            </View>
            {lineItems.map((li, i) => (
              <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.td, { flex: 1 }]}>{li.description}</Text>
                <Text style={[s.td, { width: 30 }]}>{li.quantity}</Text>
                <Text style={[s.td, { width: 35, color: GREY }]}>{li.unit}</Text>
                <Text style={[s.td, { width: 60, textAlign: 'right' }]}>${fmt(li.unit_price)}</Text>
                <Text style={[s.td, { width: 65, textAlign: 'right' }]}>${fmt(Number(li.quantity) * Number(li.unit_price))}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Labour / Timesheets ── */}
        {timesheets.filter(t => t.is_billable).length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.sectionTitle}>Labour</Text>
            <View style={s.tableHead}>
              <Text style={[s.th, { flex: 1 }]}>Technician</Text>
              <Text style={[s.th, { width: 105 }]}>Start</Text>
              <Text style={[s.th, { width: 45 }]}>Hours</Text>
              <Text style={[s.th, { width: 45, textAlign: 'right' }]}>Rate</Text>
              <Text style={[s.th, { width: 60, textAlign: 'right' }]}>Total</Text>
            </View>
            {timesheets.filter(t => t.is_billable).map((t, i) => {
              const hrs = t.ended_at
                ? (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 3600000
                : null
              const lineTotal = hrs != null && t.bill_rate ? hrs * Number(t.bill_rate) : null
              return (
                <View key={i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.td, { flex: 1 }]}>{t.profiles?.full_name ?? '—'}</Text>
                  <Text style={[s.td, { width: 105 }]}>{fmtDateTime(t.started_at, timezone)}</Text>
                  <Text style={[s.td, { width: 45 }]}>{hrs != null ? `${hrs.toFixed(2)}h` : 'Running'}</Text>
                  <Text style={[s.td, { width: 45, textAlign: 'right', color: GREY }]}>{t.bill_rate ? `$${fmt(t.bill_rate)}/hr` : '—'}</Text>
                  <Text style={[s.td, { width: 60, textAlign: 'right' }]}>{lineTotal != null ? `$${fmt(lineTotal)}` : '—'}</Text>
                </View>
              )
            })}
          </View>
        ) : null}

        {/* ── Notes ── */}
        {notes.length > 0 ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={s.sectionTitle}>Notes</Text>
            {notes.map((n, i) => (
              <View key={i} style={{ marginBottom: 5 }}>
                <Text style={{ fontSize: 7, color: GREY, marginBottom: 1 }}>{n.profiles?.full_name ?? '—'} · {fmtDateTime(n.created_at, timezone)}</Text>
                <Text style={{ fontSize: 9, color: '#374151', lineHeight: 1.4 }}>{n.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ── Totals ── */}
        {showTotals ? (
          <View style={s.totalBox}>
            {lineSubtotal > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Materials &amp; Services</Text>
                <Text style={s.totalValue}>${fmt(lineSubtotal)}</Text>
              </View>
            ) : null}
            {labourSubtotal > 0 ? (
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Labour</Text>
                <Text style={s.totalValue}>${fmt(labourSubtotal)}</Text>
              </View>
            ) : null}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Subtotal (excl. GST)</Text>
              <Text style={s.totalValue}>${fmt(subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={[s.totalLabel, { color: GREY }]}>GST ({Math.round(gstRate * 100)}%)</Text>
              <Text style={[s.totalValue, { color: GREY }]}>${fmt(gst)}</Text>
            </View>
            <View style={s.grandTotal}>
              <Text style={s.grandLabel}>Total (incl. GST)</Text>
              <Text style={s.grandValue}>${fmt(total)}</Text>
            </View>
          </View>
        ) : null}

        {/* ── Signature blocks ── */}
        <View style={s.sigRow}>
          <View style={s.sigBox}>
            <View style={s.sigSpacer} />
            <Text style={s.sigLabel}>Technician signature</Text>
            <Text style={{ fontSize: 7.5, color: GREY, marginTop: 2 }}>Date: _____________</Text>
          </View>
          <View style={s.sigBox}>
            <View style={s.sigSpacer} />
            <Text style={s.sigLabel}>Customer signature</Text>
            <Text style={{ fontSize: 7.5, color: GREY, marginTop: 2 }}>Date: _____________</Text>
          </View>
          <View style={s.sigBox}>
            <View style={s.sigSpacer} />
            <Text style={s.sigLabel}>Print name</Text>
            <Text style={{ fontSize: 7.5, color: GREY, marginTop: 2 }}>Date: _____________</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Text style={s.footerText}>{job.job_number} · {job.customers?.name ?? ''}</Text>
          <Text style={s.footerText}>Generated {fmtDate(new Date().toISOString(), timezone)}</Text>
        </View>
      </Page>
    </Document>
  )
}
