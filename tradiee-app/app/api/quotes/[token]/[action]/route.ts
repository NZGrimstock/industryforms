import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { nextDocNumber } from '@/lib/numbering'
import { putObject, publicUrl, PUBLIC_BUCKET } from '@/lib/r2'

export async function POST(req: Request, { params }: { params: Promise<{ token: string; action: string }> }) {
  const { token, action } = await params
  if (!['accept', 'decline'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: quote } = await supabase
    .from('quotes')
    .select('id, status, title, company_id, customer_id, customer_message')
    .eq('public_token', token)
    .single()

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['draft', 'sent'].includes(quote.status)) return NextResponse.json({ error: 'Quote already responded to' }, { status: 409 })

  // Accepting requires a drawn signature + name. This endpoint is public
  // (token-only), so the image is validated strictly before it's stored:
  // must be a PNG data URL, non-empty, and capped in size.
  let signatureUrl: string | null = null
  let signedByName: string | null = null
  if (action === 'accept') {
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const signature = typeof body.signature === 'string' ? body.signature : ''
    signedByName = typeof body.signed_by_name === 'string' ? body.signed_by_name.trim().slice(0, 120) : ''
    if (!signedByName) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
    if (!signature.startsWith('data:image/png;base64,')) {
      return NextResponse.json({ error: 'Please sign the quote to accept it.' }, { status: 400 })
    }
    const buffer = Buffer.from(signature.slice('data:image/png;base64,'.length), 'base64')
    if (buffer.length === 0 || buffer.length > 2_000_000) {
      return NextResponse.json({ error: 'Signature image is invalid or too large.' }, { status: 400 })
    }
    const key = `quote-signatures/${quote.company_id}/${quote.id}/signature-${Date.now()}.png`
    try {
      await putObject(PUBLIC_BUCKET, key, buffer, 'image/png')
      signatureUrl = publicUrl(key)
    } catch {
      return NextResponse.json({ error: 'Could not save your signature. Please try again.' }, { status: 502 })
    }
  }

  const updates = action === 'accept'
    ? {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        signature_url: signatureUrl,
        signed_by_name: signedByName,
        signed_at: new Date().toISOString(),
      }
    : { status: 'declined', declined_at: new Date().toISOString() }

  const { error } = await supabase.from('quotes').update(updates).eq('id', quote.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // When customer accepts: auto-create a job + to-do for the team
  if (action === 'accept') {
    try {
      const job_number = await nextDocNumber(supabase, quote.company_id, 'job')
      const { data: job } = await supabase.from('jobs').insert({
        job_number,
        title: quote.title,
        description: quote.customer_message ?? null,
        customer_id: quote.customer_id ?? null,
        company_id: quote.company_id,
        status: 'unscheduled',
        quote_id: quote.id,
      }).select('id').single()

      if (job) {
        await supabase.from('quotes').update({ converted_to_job_id: job.id }).eq('id', quote.id)
        // To-do assigned to nobody (company-wide) so any admin sees it
        await supabase.from('todos').insert({
          company_id: quote.company_id,
          title: `Quote "${quote.title}" accepted by customer — schedule job booking`,
          priority: 'high',
          status: 'pending',
          job_id: job.id,
        })
      }
    } catch {
      // Non-fatal: quote already accepted, job creation is best-effort
    }
  }

  return NextResponse.json({ success: true })
}
