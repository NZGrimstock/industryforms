'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Send, PackageCheck, XCircle, Trash2, Mail } from 'lucide-react'

interface Props {
  po: { id: string; status: string; supplier_email: string | null; supplier_phone: string | null; job_id: string | null }
}

export function PurchaseOrderActions({ po }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState('')

  async function setStatus(status: string, extra: Record<string, unknown> = {}, msg = 'Updated') {
    setLoading(status)
    const { error } = await supabase.from('purchase_orders').update({ status, ...extra }).eq('id', po.id)
    if (error) toast(error.message, 'error')
    else { toast(msg); router.refresh() }
    setLoading('')
  }

  async function emailSupplier() {
    setLoading('email')
    const res = await fetch('/api/email/purchase-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poId: po.id }) })
    const data = await res.json()
    if (!res.ok) toast(data.error ?? 'Failed to send', 'error')
    else { toast('PO emailed to supplier'); if (po.status === 'draft') router.refresh() }
    setLoading('')
  }

  async function deletePo() {
    if (!confirm('Delete this purchase order?')) return
    setLoading('delete')
    await supabase.from('purchase_order_items').delete().eq('purchase_order_id', po.id)
    await supabase.from('purchase_orders').delete().eq('id', po.id)
    toast('Purchase order deleted')
    router.push('/purchase-orders')
  }

  const canSend = ['draft', 'sent'].includes(po.status)
  const canReceive = ['sent', 'draft'].includes(po.status)
  const active = po.status !== 'cancelled' && po.status !== 'received'

  return (
    <div className="flex flex-wrap gap-2">
      {canSend && po.supplier_email && <Button size="sm" loading={loading === 'email'} onClick={emailSupplier}><Mail className="h-4 w-4" /> Email supplier</Button>}
      {canSend && <Button variant="outline" size="sm" loading={loading === 'sent'} onClick={() => setStatus('sent', { sent_at: new Date().toISOString() }, 'Marked as sent')}><Send className="h-4 w-4" /> Mark sent</Button>}
      {canReceive && <Button variant="secondary" size="sm" loading={loading === 'received'} onClick={() => setStatus('received', { received_at: new Date().toISOString() }, 'Marked as received')}><PackageCheck className="h-4 w-4" /> Mark received</Button>}
      {active && <Button variant="outline" size="sm" loading={loading === 'cancelled'} onClick={() => setStatus('cancelled', {}, 'Cancelled')}><XCircle className="h-4 w-4" /> Cancel</Button>}
      <Button variant="ghost" size="sm" loading={loading === 'delete'} onClick={deletePo}><Trash2 className="h-4 w-4 text-red-400" /></Button>
    </div>
  )
}
