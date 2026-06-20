'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Send, DollarSign, Trash2, Mail, RefreshCw, MessageSquare } from 'lucide-react'

interface Props {
  invoice: {
    id: string
    status: string
    total: number
    amount_paid: number
    customer_id: string
    job_id: string | null
    subtotal: number
    gst_amount: number
    customer_email?: string | null
    customer_phone?: string | null
    external_id?: string | null
  }
  companyId: string
  gstRate: number
  xeroConnected?: boolean
}

type Dialog = 'line' | 'payment' | null

export function InvoiceDetailClient({ invoice, companyId, gstRate, xeroConnected }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [activeDialog, setActiveDialog] = useState<Dialog>(null)
  const [loading, setLoading] = useState(false)

  const [lineForm, setLineForm] = useState({ description: '', quantity: '1', unit: 'each', unit_price: '0' })
  const [paymentForm, setPaymentForm] = useState({ amount: (invoice.total - invoice.amount_paid).toString(), method: 'bank_transfer', notes: '' })

  async function addLine(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const qty = parseFloat(lineForm.quantity) || 1
    const price = parseFloat(lineForm.unit_price) || 0
    const lineTotal = qty * price

    // Recalculate invoice totals
    const newSubtotal = invoice.subtotal + lineTotal
    const newGst = newSubtotal * gstRate
    const newTotal = newSubtotal + newGst

    const [lineRes] = await Promise.all([
      supabase.from('invoice_line_items').insert({
        invoice_id: invoice.id,
        type: 'misc',
        description: lineForm.description,
        quantity: qty,
        unit: lineForm.unit,
        unit_price: price,
        line_total: lineTotal,
        sort_order: 99,
      }),
    ])

    await supabase.from('invoices').update({ subtotal: newSubtotal, gst_amount: newGst, total: newTotal }).eq('id', invoice.id)

    if (lineRes.error) toast(lineRes.error.message, 'error')
    else { toast('Line added'); setActiveDialog(null); router.refresh() }
    setLoading(false)
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const amount = parseFloat(paymentForm.amount) || 0
    const newAmountPaid = invoice.amount_paid + amount
    const newStatus = newAmountPaid >= invoice.total ? 'paid' : 'partially_paid'

    await supabase.from('payments').insert({
      invoice_id: invoice.id,
      amount,
      method: paymentForm.method,
      notes: paymentForm.notes || null,
      paid_at: new Date().toISOString(),
    })
    await supabase.from('invoices').update({
      amount_paid: newAmountPaid,
      status: newStatus,
      paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
    }).eq('id', invoice.id)

    toast('Payment recorded')
    setActiveDialog(null)
    router.refresh()
    setLoading(false)
  }

  async function markSent() {
    setLoading(true)
    await supabase.from('invoices').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', invoice.id)
    toast('Invoice marked as sent')
    router.refresh()
    setLoading(false)
  }

  async function syncToXero() {
    setLoading(true)
    const res = await fetch('/api/xero/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.id }) })
    const data = await res.json()
    if (!res.ok) toast(data.error ?? 'Xero sync failed', 'error')
    else { toast('Synced to Xero'); router.refresh() }
    setLoading(false)
  }

  async function sendEmail() {
    setLoading(true)
    const res = await fetch('/api/email/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.id }) })
    const data = await res.json()
    if (!res.ok) toast(data.error ?? 'Failed to send email', 'error')
    else { toast('Invoice emailed to customer'); router.refresh() }
    setLoading(false)
  }

  async function sendText() {
    setLoading(true)
    const res = await fetch('/api/sms/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: invoice.id }) })
    const data = await res.json()
    if (!res.ok) toast(data.error ?? 'Failed to send text', 'error')
    else toast('Invoice texted to customer')
    setLoading(false)
  }

  async function deleteInvoice() {
    if (!confirm('Delete this invoice?')) return
    setLoading(true)
    await supabase.from('invoice_line_items').delete().eq('invoice_id', invoice.id)
    await supabase.from('payments').delete().eq('invoice_id', invoice.id)
    await supabase.from('invoices').delete().eq('id', invoice.id)
    toast('Invoice deleted')
    router.push('/invoices')
  }

  const isDraft = invoice.status === 'draft'
  const canSendEmail = ['draft', 'sent', 'overdue'].includes(invoice.status) && !!invoice.customer_email
  const canSendText = ['draft', 'sent', 'partially_paid', 'overdue'].includes(invoice.status) && !!invoice.customer_phone
  const canPay = ['sent', 'partially_paid', 'overdue'].includes(invoice.status)

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setActiveDialog('line')}><Plus className="h-4 w-4" /> Add line</Button>
      {canSendEmail && <Button size="sm" loading={loading} onClick={sendEmail}><Mail className="h-4 w-4" /> Send email</Button>}
      {canSendText && <Button variant="outline" size="sm" loading={loading} onClick={sendText}><MessageSquare className="h-4 w-4" /> Text</Button>}
      {xeroConnected && <Button variant="outline" size="sm" loading={loading} onClick={syncToXero}><RefreshCw className="h-4 w-4" />{invoice.external_id ? 'Re-sync Xero' : 'Sync to Xero'}</Button>}
      {isDraft && <Button variant="outline" size="sm" onClick={markSent}><Send className="h-4 w-4" /> Mark sent</Button>}
      {canPay && <Button size="sm" onClick={() => setActiveDialog('payment')}><DollarSign className="h-4 w-4" /> Record payment</Button>}
      <Button variant="ghost" size="sm" onClick={deleteInvoice}><Trash2 className="h-4 w-4 text-red-400" /></Button>

      <Dialog open={activeDialog === 'line'} onClose={() => setActiveDialog(null)} title="Add line item">
        <form onSubmit={addLine} className="space-y-4">
          <div><Label>Description <span className="text-red-400">*</span></Label><Input value={lineForm.description} onChange={e => setLineForm(f => ({ ...f, description: e.target.value }))} required /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Qty</Label><Input type="number" step="0.01" value={lineForm.quantity} onChange={e => setLineForm(f => ({ ...f, quantity: e.target.value }))} /></div>
            <div><Label>Unit</Label><Input value={lineForm.unit} onChange={e => setLineForm(f => ({ ...f, unit: e.target.value }))} /></div>
            <div><Label>Unit price</Label><Input type="number" step="0.01" value={lineForm.unit_price} onChange={e => setLineForm(f => ({ ...f, unit_price: e.target.value }))} /></div>
          </div>
          <div className="flex gap-3"><Button type="submit" loading={loading}>Add line</Button><Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </form>
      </Dialog>

      <Dialog open={activeDialog === 'payment'} onClose={() => setActiveDialog(null)} title="Record payment">
        <form onSubmit={recordPayment} className="space-y-4">
          <div><Label>Amount <span className="text-red-400">*</span></Label><Input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} required /></div>
          <div><Label>Method</Label>
            <Select value={paymentForm.method} onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))} options={[
              { value: 'bank_transfer', label: 'Bank transfer' },
              { value: 'stripe', label: 'Stripe / card' },
              { value: 'cash', label: 'Cash' },
              { value: 'cheque', label: 'Cheque' },
              { value: 'other', label: 'Other' },
            ]} />
          </div>
          <div><Label>Notes</Label><Input value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex gap-3"><Button type="submit" loading={loading}>Record payment</Button><Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </form>
      </Dialog>
    </div>
  )
}
