'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog } from '@/components/ui/dialog'
import { Send, CheckCircle, XCircle, Trash2, Mail, Pencil, MessageSquare, Briefcase, Loader2, ShoppingCart } from 'lucide-react'
import Link from 'next/link'

interface Props {
  quote: {
    id: string
    status: string
    public_token: string
    customer_id: string
    converted_to_job_id: string | null
    title: string
    customers: {name: string; email?: string | null; phone?: string | null} | null
  }
  companyId: string
  nextJobNumber: string
}

export function QuoteActions({ quote, companyId, nextJobNumber }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState('')
  const [acceptOpen, setAcceptOpen] = useState(false)
  const [jobDescription, setJobDescription] = useState('')

  async function orderParts() {
    setLoading('order')
    try {
      const res = await fetch('/api/purchase-orders/from-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quote.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create purchase orders')
      router.push(`/purchase-orders/from-quote/${quote.id}`)
    } catch (e: any) {
      toast(e.message ?? 'Could not create purchase orders', 'error')
      setLoading('')
    }
  }

  async function markAccepted() {
    setLoading('accepted')
    try {
      // 1. Mark quote as accepted
      const { error: qErr } = await supabase
        .from('quotes')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', quote.id)
      if (qErr) throw new Error(qErr.message)

      // 2. Auto-create a job via the API (which generates a proper job_number)
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: quote.title,
          description: jobDescription || null,
          customer_id: quote.customer_id,
          quote_id: quote.id,
          status: 'unscheduled',
        }),
      })
      const job = await res.json()
      if (!res.ok) throw new Error(job.error ?? 'Failed to create job')

      // 3. Auto-create a to-do: "Schedule job booking with client"
      await supabase.from('todos').insert({
        company_id: companyId,
        title: `Quote ${quote.title} accepted — schedule job booking with client`,
        priority: 'high',
        status: 'pending',
        job_id: job.id,
      })

      toast('Quote accepted — job created!')
      setAcceptOpen(false)
      router.push(`/jobs/${job.id}`)
    } catch (e: any) {
      toast(e.message ?? 'Failed to accept quote', 'error')
    }
    setLoading('')
  }

  async function markDeclined() {
    setLoading('declined')
    const { error } = await supabase.from('quotes').update({ status: 'declined', declined_at: new Date().toISOString() }).eq('id', quote.id)
    if (error) toast(error.message, 'error')
    else { toast('Quote declined'); router.refresh() }
    setLoading('')
  }

  async function deleteQuote() {
    if (!confirm('Delete this quote? This cannot be undone.')) return
    setLoading('delete')
    await supabase.from('quote_line_items').delete().eq('quote_id', quote.id)
    await supabase.from('quote_sections').delete().eq('quote_id', quote.id)
    const { error } = await supabase.from('quotes').delete().eq('id', quote.id)
    if (error) { toast(error.message, 'error'); setLoading(''); return }
    toast('Quote deleted')
    router.push('/quotes')
  }

  async function sendEmail() {
    setLoading('email')
    const res = await fetch('/api/email/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: quote.id }) })
    const data = await res.json()
    if (!res.ok) toast(data.error ?? 'Failed to send email', 'error')
    else { toast('Quote emailed to customer'); router.refresh() }
    setLoading('')
  }

  async function sendText() {
    setLoading('sms')
    const res = await fetch('/api/sms/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: quote.id }) })
    const data = await res.json()
    if (!res.ok) toast(data.error ?? 'Failed to send text', 'error')
    else { toast('Quote texted to customer'); router.refresh() }
    setLoading('')
  }

  const isDraft = quote.status === 'draft'
  const canSend = ['draft', 'sent'].includes(quote.status)
  const hasCustomerEmail = !!quote.customers?.email
  const hasCustomerPhone = !!quote.customers?.phone
  const canAccept = ['draft', 'sent'].includes(quote.status)
  const canDelete = !quote.converted_to_job_id

  return (
    <div className="flex flex-wrap gap-2">
      {isDraft && (
        <Link href={`/quotes/${quote.id}/edit`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700">
          <Pencil className="h-4 w-4" /> Edit
        </Link>
      )}
      {canSend && hasCustomerEmail && <Button size="sm" loading={loading === 'email'} onClick={sendEmail}><Mail className="h-4 w-4" /> Send email</Button>}
      {canSend && hasCustomerPhone && <Button variant="outline" size="sm" loading={loading === 'sms'} onClick={sendText}><MessageSquare className="h-4 w-4" /> Text</Button>}
      {canAccept && (
        <Button variant="secondary" size="sm" loading={loading === 'accepted'} onClick={() => setAcceptOpen(true)}>
          <CheckCircle className="h-4 w-4" /> Accept
        </Button>
      )}
      {canAccept && <Button variant="outline" size="sm" loading={loading === 'declined'} onClick={markDeclined}><XCircle className="h-4 w-4" /> Decline</Button>}
      {quote.converted_to_job_id && (
        <Link href={`/jobs/${quote.converted_to_job_id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-green-200 rounded-lg bg-green-50 text-green-700 hover:bg-green-100">
          <Briefcase className="h-4 w-4" /> View job
        </Link>
      )}
      {quote.status === 'accepted' && (
        <Button variant="secondary" size="sm" loading={loading === 'order'} onClick={orderParts}>
          <ShoppingCart className="h-4 w-4" /> Order parts
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" size="sm" loading={loading === 'delete'} onClick={deleteQuote}>
          <Trash2 className="h-4 w-4 text-red-400" />
        </Button>
      )}

      <Dialog open={acceptOpen} onClose={() => setAcceptOpen(false)} title="Accept quote & create job">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            This will mark the quote as accepted and automatically create job <strong>{nextJobNumber}</strong>.
            A to-do reminder will be added to your dashboard.
          </p>
          <div>
            <Label>Job description (optional)</Label>
            <Textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={3} placeholder="Additional details for the job…" />
          </div>
          <div className="flex gap-3">
            <Button loading={loading === 'accepted'} onClick={markAccepted}>
              {loading === 'accepted' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Accept & create job
            </Button>
            <Button variant="outline" onClick={() => setAcceptOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
