'use client'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type ConnectStatus = {
  connected: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
  account_name: string | null
  account_id: string | null
}

// Stripe Connect (Express) onboarding entry point. Lets a company connect its
// own Stripe account so customer payments settle to it directly. Status comes
// from GET /api/stripe/connect/status; the button POSTs onboard and redirects
// to Stripe's hosted flow (which returns to ?tab=subscription&connect=done).
// Which Stripe account is actually linked. Shown wherever an account exists —
// without it "Payouts active" gives no way to tell WHICH account is taking the
// money, which matters for anyone who has more than one.
function ConnectedAccount({ status, className }: { status: ConnectStatus | null; className?: string }) {
  if (!status?.connected) return null
  return (
    <p className={`text-xs ${className ?? 'text-gray-500'}`}>
      {status.account_name ?? 'Stripe account'}
      {status.account_id && <span className="opacity-70"> · {status.account_id}</span>}
    </p>
  )
}

export function GetPaidCard() {
  const [status, setStatus] = useState<ConnectStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/stripe/connect/status')
      if (res.ok) setStatus(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function disconnect() {
    // Money-critical and not obvious from the button alone: this stops every
    // card payment the company can take until they reconnect.
    if (!confirm(
      'Disconnect this Stripe account?\n\n' +
      'Card payments — online invoices, deposits and Tap to Pay — will stop working until you connect an account again.\n\n' +
      'Your Stripe account itself is not deleted: its balance, payouts and payment history stay in your Stripe dashboard.'
    )) return
    setDisconnecting(true)
    setError('')
    try {
      const res = await fetch('/api/stripe/connect/disconnect', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not disconnect')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setDisconnecting(false)
    }
  }

  async function startOnboarding() {
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/stripe/connect/onboard', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start onboarding')
      window.location.href = data.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStarting(false)
    }
  }

  const ready = !!status?.connected && status.charges_enabled && status.payouts_enabled
  const inProgress = !!status?.connected && !ready

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Get paid — card payments</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Connect your own Stripe account so customer payments — online invoices, deposits and Tap to Pay — land directly in your bank account. IndustryForms takes no cut.
        </p>

        {loading ? (
          <p className="text-sm text-gray-400">Checking status…</p>
        ) : ready ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <p className="text-sm font-medium text-green-800">Payouts active — you&apos;re set to take payments.</p>
              </div>
              <ConnectedAccount status={status} className="mt-1.5 pl-4 text-green-700" />
            </div>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        ) : inProgress ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-800">Setup incomplete</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Stripe still needs {status?.details_submitted ? 'to finish verifying your details' : 'a few more details'} before you can take payments.
              </p>
              <ConnectedAccount status={status} className="mt-1.5 text-amber-700" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startOnboarding} disabled={starting}>{starting ? 'Opening…' : 'Finish setup'}</Button>
              {/* Reachable here too: a half-finished account attached to the
                  wrong entity can only be escaped by disconnecting it. */}
              <Button variant="outline" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={startOnboarding} disabled={starting}>{starting ? 'Opening…' : 'Set up payouts'}</Button>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <p className="text-xs text-gray-400">
          Not sure what to expect?{' '}
          <a href="/settings/help/tap-to-pay" className="font-medium text-[var(--accent,#f97316)] hover:underline">
            Read the step-by-step setup guide →
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
