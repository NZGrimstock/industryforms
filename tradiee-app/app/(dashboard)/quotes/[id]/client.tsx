'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Send, CheckCircle, XCircle, Briefcase, Trash2, Mail, Pencil, MessageSquare } from 'lucide-react'
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
  const [convertOpen, setConvertOpen] = useState(false)
  const [jobDescription, setJobDescription] = useState('')

  async function markSent() {
    setLoading('sent')
    const { error } = await supabase.from('quotes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quote.id)
    if (error) toast(error.message, 'error')
    else { toast('Quote marked as sent'); router.refresh() }
    setLoading('')
  }

  async function markAccepted() {
    setLoading('accepted')
    const { error } = await supabase.from('quotes').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', quote.id)
    if (error) toast(error.message, 'error')
    else { toast('Quote accepted'); router.refresh() }
    setLoading('')
  }

  async function markDeclined() {
    setLoading('declined')
    const { error } = await supabase.from('quotes').update({ status: 'declined', declined_at: new Date().toISOString() }).eq('id', quote.id)
    if (error) toast(error.message, 'error')
    else { toast('Quote declined'); router.refresh() }
    setLoading('')
  }

  async function convertToJob() {
    setLoading('convert')
    const { data: job, error } = await supabase.from('jobs').insert({
      company_id: companyId,
      customer_id: quote.customer_id,
      quote_id: quote.id,
      job_number: nextJobNumber,
      title: quote.title,
      description: jobDescription || null,
      status: 'unscheduled',
    }).select().single()
    if (error || !job) { toast(error?.message ?? 'Failed to create job', 'error'); setLoading(''); return }

    await supabase.from('quotes').update({ converted_to_job_id: job.id, status: 'accepted' }).eq('id', quote.id)
    toast('Job created!')
    router.push(`/jobs/${job.id}`)
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
  const canConvert = quote.status === 'accepted' && !quote.converted_to_job_id
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
      {canSend && <Button variant="outline" size="sm" loading={loading === 'sent'} onClick={markSent}><Send className="h-4 w-4" /> Mark sent</Button>}
      {canAccept && <Button variant="secondary" size="sm" loading={loading === 'accepted'} onClick={markAccepted}><CheckCircle className="h-4 w-4" /> Accept</Button>}
      {canAccept && <Button variant="outline" size="sm" loading={loading === 'declined'} onClick={markDeclined}><XCircle className="h-4 w-4" /> Decline</Button>}
      {canConvert && (
        <Button size="sm" loading={loading === 'convert'} onClick={() => setConvertOpen(true)}>
          <Briefcase className="h-4 w-4" /> Convert to job
        </Button>
      )}
      {canDelete && (
        <Button variant="ghost" size="sm" loading={loading === 'delete'} onClick={deleteQuote}>
          <Trash2 className="h-4 w-4 text-red-400" />
        </Button>
      )}

      <Dialog open={convertOpen} onClose={() => setConvertOpen(false)} title="Convert to job">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This will create job <strong>{nextJobNumber}</strong> from this quote.</p>
          <div>
            <Label>Job description (optional)</Label>
            <Textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={3} placeholder="Additional details..." />
          </div>
          <div className="flex gap-3">
            <Button loading={loading === 'convert'} onClick={convertToJob}>Create job</Button>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
