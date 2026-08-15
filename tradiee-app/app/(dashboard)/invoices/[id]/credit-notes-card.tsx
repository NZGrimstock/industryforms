'use client'
// Lists credit notes already issued against this invoice. Separate from the
// "Credit invoice" action itself (in client.tsx) — this is read-only history
// plus the one interactive bit, a manual "Sync to Xero" per note, matching
// how invoices themselves are only ever synced on an explicit click.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils'

type CreditNote = {
  id: string
  credit_note_number: string
  amount: number
  outcome: 'refund' | 'account_credit'
  status: 'active' | 'fully_applied' | 'void'
  reason: string | null
  external_id: string | null
  created_at: string
}

export function CreditNotesCard({ creditNotes, xeroConnected }: { creditNotes: CreditNote[]; xeroConnected: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [syncingId, setSyncingId] = useState<string | null>(null)

  if (creditNotes.length === 0) return null

  async function syncToXero(id: string) {
    setSyncingId(id)
    const res = await fetch('/api/xero/sync-credit-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creditNoteId: id }),
    })
    const data = await res.json().catch(() => ({}))
    setSyncingId(null)
    if (!res.ok) { toast(data.error ?? 'Xero sync failed', 'error'); return }
    toast('Synced to Xero')
    router.refresh()
  }

  return (
    <Card>
      <div className="px-6 py-4 border-b border-gray-100 text-sm font-semibold text-gray-900">Credits</div>
      <ul className="divide-y divide-gray-50">
        {creditNotes.map(c => (
          <li key={c.id} className="px-6 py-3 flex items-center justify-between text-sm gap-3">
            <div>
              <p className="text-gray-700">
                <span className="font-medium">{c.credit_note_number}</span>
                {' · '}
                {c.outcome === 'refund' ? 'Refunded' : 'Account credit'}
                {c.status === 'void' && <span className="text-red-500"> · Void</span>}
                {c.status === 'fully_applied' && <span className="text-gray-400"> · Fully applied</span>}
              </p>
              {c.reason && <p className="text-xs text-gray-400 mt-0.5">{c.reason}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="font-medium text-gray-900">{formatCurrency(c.amount)}</p>
              <p className="text-xs text-gray-400">{formatDate(c.created_at)}</p>
              {xeroConnected && (
                c.external_id ? (
                  <p className="text-xs text-green-600 mt-0.5">Synced to Xero</p>
                ) : (
                  <button
                    onClick={() => syncToXero(c.id)}
                    disabled={syncingId === c.id}
                    className="text-xs text-orange-500 hover:underline mt-0.5 disabled:opacity-50"
                  >
                    {syncingId === c.id ? 'Syncing…' : 'Sync to Xero'}
                  </button>
                )
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
