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
import { lineNet, discountAmount, round2, type DiscountType } from '@/lib/pricing'
import { Plus, Send, DollarSign, Trash2, Mail, RefreshCw, MessageSquare, Tag } from 'lucide-react'

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
    discount_type: DiscountType
    discount_value: number
    discount_amount: number
    customer_email?: string | null
    customer_phone?: string | null
    external_id?: string | null
  }
  companyId: string
  gstRate: number
  xeroConnected?: boolean
}

type Dialog = 'line' | 'payment' | 'discount' | null

export function InvoiceDetailClient({ invoice, companyId, gstRate, xeroConnected }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [activeDialog, setActiveDialog] = useState<Dialog>(null)
  const [loading, setLoading] = useState(false)

  const [lineForm, setLineForm] = useState({ description: '', quantity: '1', unit: 'each', unit_price: '0', discount_value: '0', discount_type: 'amount' as 'amount' | 'percent' })
  const [paymentForm, setPaymentForm] = useState({ amount: (invoice.total - invoice.amount_paid).toString(), method: 'bank_transfer', notes: '' })
  const [discountForm, setDiscountForm] = useState({ value: (invoice.discount_value || 0).toString(), type: (invoice.discount_type ?? 'amount') as 'amount' | 'percent' })

  async function addLine(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const qty = parseFloat(lineForm.quantity) || 1
    const price = parseFloat(lineForm.unit_price) || 0
    const lineDiscVal = parseFloat(lineForm.discount_value) || 0
    const lineDiscType: DiscountType = lineDiscVal > 0 ? lineForm.discount_type : null
    const lineTotal = lineNet(qty, price, lineDiscType, lineDiscVal)

    // Recalculate invoice totals, preserving any document-level discount.
    const newSubtotal = round2(invoice.subtotal + lineTotal)
    const docDisc = discountAmount(newSubtotal, invoice.discount_type, invoice.discount_value)
    const newGst = round2((newSubtotal - docDisc) * gstRate)
    const newTotal = round2(newSubtotal - docDisc + newGst)

    const [lineRes] = await Promise.all([
      supabase.from('invoice_line_items').insert({
        invoice_id: invoice.id,
        type: 'misc',
        description: lineForm.description,
        quantity: qty,
        unit: lineForm.unit,
        unit_price: price,
        discount_type: lineDiscType,
        discount_value: lineDiscVal,
        line_total: lineTotal,
        sort_order: 99,
      }),
    ])

    await supabase.from('invoices').update({ subtotal: newSubtotal, discount_amount: docDisc, gst_amount: newGst, total: newTotal }).eq('id', invoice.id)

    if (lineRes.error) toast(lineRes.error.message, 'error')
    else { toast('Line added'); setActiveDialog(null); setLineForm({ description: '', quantity: '1', unit: 'each', unit_price: '0', discount_value: '0', discount_type: 'amount' }); router.refresh() }
    setLoading(false)
  }

  async function saveDiscount(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const value = parseFloat(discountForm.value) || 0
    const type: DiscountType = value > 0 ? discountForm.type : null
    const docDisc = discountAmount(invoice.subtotal, type, value)
    const newGst = round2((invoice.subtotal - docDisc) * gstRate)
    const newTotal = round2(invoice.subtotal - docDisc + newGst)
    await supabase.from('invoices').update({
      discount_type: type, discount_value: value, discount_amount: docDisc,
      gst_amount: newGst, total: newTotal,
    }).eq('id', invoice.id)
    toast('Discount updated')
    setActiveDialog(null)
    router.refresh()
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
      <Button variant="outline" size="sm" onClick={() => setActiveDialog('discount')}><Tag className="h-4 w-4" /> {invoice.discount_amount > 0 ? 'Edit discount' : 'Add discount'}</Button>
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
          <div>
            <Label>Line discount (optional)</Label>
            <div className="flex gap-2">
              <Input type="number" min="0" step="0.01" value={lineForm.discount_value} onChange={e => setLineForm(f => ({ ...f, discount_value: e.target.value }))} className="flex-1" />
              <Select value={lineForm.discount_type} onChange={e => setLineForm(f => ({ ...f, discount_type: e.target.value as 'amount' | 'percent' }))} options={[{ value: 'amount', label: '$ off' }, { value: 'percent', label: '% off' }]} />
            </div>
          </div>
          <div className="flex gap-3"><Button type="submit" loading={loading}>Add line</Button><Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
        </form>
      </Dialog>

      <Dialog open={activeDialog === 'discount'} onClose={() => setActiveDialog(null)} title="Invoice discount">
        <form onSubmit={saveDiscount} className="space-y-4">
          <p className="text-sm text-gray-500">Applied to the subtotal, before GST. Set to 0 to remove.</p>
          <div className="flex gap-2">
            <div className="flex-1"><Label>Amount</Label><Input type="number" min="0" step="0.01" value={discountForm.value} onChange={e => setDiscountForm(f => ({ ...f, value: e.target.value }))} /></div>
            <div><Label>Type</Label><Select value={discountForm.type} onChange={e => setDiscountForm(f => ({ ...f, type: e.target.value as 'amount' | 'percent' }))} options={[{ value: 'amount', label: '$ off' }, { value: 'percent', label: '% off' }]} /></div>
          </div>
          <div className="flex gap-3"><Button type="submit" loading={loading}>Save discount</Button><Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancel</Button></div>
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
