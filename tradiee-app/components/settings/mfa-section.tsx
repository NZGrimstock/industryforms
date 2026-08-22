'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ShieldCheck } from 'lucide-react'

type Factor = { id: string; friendly_name?: string; status: string }

export function MfaSection() {
  const supabase = createClient()
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refreshFactors() {
    setLoading(true)
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors((data?.totp ?? []) as Factor[])
    setLoading(false)
  }

  useEffect(() => {
    refreshFactors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startEnroll() {
    setError('')
    setBusy(true)
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    setBusy(false)
    if (err) { setError(err.message); return }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setEnrolling(true)
  }

  async function confirmEnroll() {
    if (!factorId || code.length < 6) return
    setError('')
    setBusy(true)
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr) { setBusy(false); setError(challengeErr.message); return }
    const { error: verifyErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code })
    setBusy(false)
    if (verifyErr) { setError(verifyErr.message); return }
    setEnrolling(false)
    setQrCode(null)
    setSecret(null)
    setCode('')
    await refreshFactors()
  }

  async function removeFactor(id: string) {
    if (!confirm('Remove this authenticator? You will no longer be asked for a code at sign-in.')) return
    setBusy(true)
    await supabase.auth.mfa.unenroll({ factorId: id })
    setBusy(false)
    await refreshFactors()
  }

  const verified = factors.filter(f => f.status === 'verified')

  return (
    <Card className="max-w-xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Two-factor authentication</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : verified.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-green-700">&#10003; An authenticator app is enabled on your account</p>
            {verified.map(f => (
              <div key={f.id} className="flex items-center justify-between text-sm text-gray-600">
                <span>{f.friendly_name || 'Authenticator app'}</span>
                <button type="button" onClick={() => removeFactor(f.id)} disabled={busy} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
              </div>
            ))}
          </div>
        ) : enrolling ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code it shows.</p>
            {qrCode && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qrCode} alt="MFA QR code" className="w-40 h-40 border border-gray-200 rounded-lg" />
            )}
            {secret && <p className="text-xs text-gray-400 font-mono break-all">Manual entry key: {secret}</p>}
            <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit code" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={confirmEnroll} loading={busy} disabled={code.length < 6}>Confirm</Button>
              <Button variant="outline" onClick={() => { setEnrolling(false); setQrCode(null); setSecret(null); setCode(''); setError('') }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-3">Add an authenticator app for an extra layer of security when you sign in.</p>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <Button onClick={startEnroll} loading={busy}>Enable two-factor authentication</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
