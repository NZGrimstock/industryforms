'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SignaturePad } from '@/components/ui/signature-pad'
import { CheckCircle, XCircle } from 'lucide-react'

// Mirrors PublicQuoteActions (app/q/[token]/client.tsx) — same two-step
// sign-then-approve flow, so a customer who has accepted a quote from this
// company already recognises it.
export function PublicVariationActions({ token }: { token: string }) {
  const [loading, setLoading] = useState('')
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [signing, setSigning] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [signedName, setSignedName] = useState('')

  async function respond(action: 'approve' | 'decline') {
    setError('')
    setLoading(action)
    const body = action === 'approve'
      ? JSON.stringify({ signature, signed_by_name: signedName.trim() })
      : undefined
    const res = await fetch(`/api/variations/${token}/${action}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body,
    })
    if (res.ok) { setDone(action); return }
    const data = await res.json().catch(() => ({}))
    setError(data.error ?? 'Something went wrong. Please try again.')
    setLoading('')
  }

  if (done === 'approve') {
    return <div className="text-center py-6 text-green-600 font-semibold text-lg">✓ Thank you! This variation is approved and the work can go ahead.</div>
  }
  if (done === 'decline') {
    return <div className="text-center py-6 text-gray-500">You&apos;ve declined this variation. We&apos;ll be in touch.</div>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {!signing ? (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
          <p className="text-sm text-gray-600 sm:mr-4">Happy for this work to go ahead?</p>
          <Button onClick={() => setSigning(true)} className="gap-2">
            <CheckCircle className="h-4 w-4" /> Approve variation
          </Button>
          <Button variant="outline" loading={loading === 'decline'} onClick={() => respond('decline')} className="gap-2">
            <XCircle className="h-4 w-4" /> Decline
          </Button>
        </div>
      ) : (
        <div className="max-w-md mx-auto space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900">Sign to approve</h3>
            <p className="text-sm text-gray-500">Please sign below to confirm you approve this extra work and the revised price.</p>
          </div>

          <div>
            <Label>Your name <span className="text-red-400">*</span></Label>
            <Input value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Full name" />
          </div>

          <div>
            <Label>Signature <span className="text-red-400">*</span></Label>
            <SignaturePad onChange={setSignature} />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

          <div className="flex gap-3">
            <Button
              loading={loading === 'approve'}
              disabled={!signature || !signedName.trim()}
              onClick={() => respond('approve')}
              className="gap-2"
            >
              <CheckCircle className="h-4 w-4" /> Approve variation
            </Button>
            <Button variant="outline" onClick={() => { setSigning(false); setError('') }}>Back</Button>
          </div>
          {(!signature || !signedName.trim()) && (
            <p className="text-xs text-gray-400">Enter your name and sign above to approve.</p>
          )}
        </div>
      )}
    </div>
  )
}
