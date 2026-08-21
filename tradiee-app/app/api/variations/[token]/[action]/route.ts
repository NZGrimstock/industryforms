import { NextResponse, after } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { putObject, publicUrl, PUBLIC_BUCKET } from '@/lib/r2'

// Public, token-only — the customer approving extra work has no login. Mirrors
// /api/quotes/[token]/[action] (quote acceptance), including the strict
// validation on the drawn signature before anything is stored.
//
// Approving here is what raises the job's invoiceable ceiling: job_is_locked()
// (20260820100000_variations.sql) sums approved variations, so a job that was
// locked as fully-invoiced reopens by itself the moment this succeeds.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; action: string }> }) {
  const { token, action } = await params
  if (!['approve', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: variation } = await service
    .from('variations')
    .select('id, company_id, job_id, status, title, variation_number, total')
    .eq('public_token', token)
    .single()

  if (!variation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // A draft link shouldn't normally be out in the world, but accept it the same
  // way quote acceptance does rather than stranding a customer who has one.
  if (!['draft', 'sent'].includes(variation.status)) {
    return NextResponse.json({ error: 'This variation has already been responded to.' }, { status: 409 })
  }

  const now = new Date().toISOString()

  if (action === 'decline') {
    const { error } = await service
      .from('variations')
      .update({ status: 'declined', declined_at: now })
      .eq('id', variation.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const signature = typeof body.signature === 'string' ? body.signature : ''
  const signedByName = typeof body.signed_by_name === 'string' ? body.signed_by_name.trim().slice(0, 120) : ''
  if (!signedByName) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!signature.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'Please sign to approve this variation.' }, { status: 400 })
  }
  const buffer = Buffer.from(signature.slice('data:image/png;base64,'.length), 'base64')
  if (buffer.length === 0 || buffer.length > 2_000_000) {
    return NextResponse.json({ error: 'Signature image is invalid or too large.' }, { status: 400 })
  }

  let signatureUrl: string
  const key = `variation-signatures/${variation.company_id}/${variation.id}/signature-${Date.now()}.png`
  try {
    await putObject(PUBLIC_BUCKET, key, buffer, 'image/png')
    signatureUrl = publicUrl(key)
  } catch {
    return NextResponse.json({ error: 'Could not save your signature. Please try again.' }, { status: 502 })
  }

  const { error } = await service
    .from('variations')
    .update({
      status: 'approved',
      approved_at: now,
      signature_url: signatureUrl,
      signed_by_name: signedByName,
      signed_at: now,
    })
    .eq('id', variation.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Tell the team the ceiling moved — the job may have just come off its
  // fully-invoiced lock and there's now more to bill. Best-effort: the
  // approval itself has already been recorded and must not fail on this,
  // and must not block the customer's response either. after() (not a bare
  // un-awaited call) because Vercel freezes this function's execution
  // environment the instant the response is sent — see the identical fix in
  // app/api/auth/signup/route.ts's notifyAdminConsole() for the incident.
  after(async () => {
    await service.from('todos').insert({
      company_id: variation.company_id,
      title: `Variation ${variation.variation_number} approved by customer — $${Number(variation.total).toFixed(2)} now billable`,
      priority: 'high',
      status: 'pending',
      job_id: variation.job_id,
    })
  })

  return NextResponse.json({ success: true })
}
