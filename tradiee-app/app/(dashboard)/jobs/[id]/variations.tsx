'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { lineNet, round2 } from '@/lib/pricing'
import { Plus, Trash2, Send, Link2, Check, X, PenLine } from 'lucide-react'

export type VariationItem = {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  line_total: number
  sort_order: number
}

export type Variation = {
  id: string
  variation_number: string
  title: string
  description: string | null
  status: string
  subtotal: number
  gst_amount: number
  total: number
  public_token: string
  sent_at: string | null
  approved_at: string | null
  signed_by_name: string | null
  variation_items?: VariationItem[]
}

interface Props {
  jobId: string
  companyId: string
  profileId: string
  quoteId: string | null
  variations: Variation[]
  gstRate: number
  pricesIncludeTax: boolean
  appUrl: string
}

const STATUS_STYLE: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-50 text-blue-700',
  approved: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-600',
  void:     'bg-gray-100 text-gray-400',
}

type DraftLine = { description: string; quantity: string; unit: string; unit_price: string }

const BLANK_LINE: DraftLine = { description: '', quantity: '1', unit: 'each', unit_price: '' }

export function JobVariations({ jobId, companyId, profileId, quoteId, variations, gstRate, pricesIncludeTax, appUrl }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([{ ...BLANK_LINE }])

  // Same money path as quotes: lineNet() strips the tax portion when the
  // company enters GST-inclusive prices, so line_total is always stored NET —
  // matching quote_line_items, which POST /api/invoices sums against invoice
  // subtotals. Storing gross here would overstate the ceiling by one GST rate.
  const netOf = (l: DraftLine) =>
    lineNet(parseFloat(l.quantity) || 0, parseFloat(l.unit_price) || 0, null, 0, gstRate, pricesIncludeTax)
  const draftSubtotal = round2(lines.reduce((s, l) => s + netOf(l), 0))
  const draftGst = round2(draftSubtotal * gstRate)
  const draftTotal = round2(draftSubtotal + draftGst)

  const filledLines = lines.filter(l => l.description.trim())

  function reset() {
    setTitle('')
    setDescription('')
    setLines([{ ...BLANK_LINE }])
    setAdding(false)
    setError('')
  }

  function setLine(i: number, patch: Partial<DraftLine>) {
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function save() {
    if (!title.trim() || filledLines.length === 0) return
    setSaving(true)
    setError('')
    // variation_number is assigned by the DB trigger, not here.
    const { data: variation, error: vErr } = await supabase.from('variations').insert({
      company_id: companyId,
      job_id: jobId,
      quote_id: quoteId,
      title: title.trim(),
      description: description.trim() || null,
      status: 'draft',
      subtotal: draftSubtotal,
      gst_amount: draftGst,
      total: draftTotal,
      created_by: profileId,
    }).select('id').single()

    if (vErr || !variation) {
      setSaving(false)
      setError(vErr?.message ?? 'Could not create the variation.')
      return
    }

    const { error: iErr } = await supabase.from('variation_items').insert(
      filledLines.map((l, i) => ({
        variation_id: variation.id,
        description: l.description.trim(),
        quantity: parseFloat(l.quantity) || 1,
        unit: l.unit || 'each',
        unit_price: parseFloat(l.unit_price) || 0,
        line_total: netOf(l),
        sort_order: i,
      }))
    )
    setSaving(false)
    if (iErr) { setError(iErr.message); return }
    reset()
    router.refresh()
  }

  async function setStatus(v: Variation, status: string) {
    setBusyId(v.id)
    setError('')
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = { status }
    if (status === 'sent') patch.sent_at = now
    if (status === 'approved') { patch.approved_at = now; patch.approved_by_profile_id = profileId }
    if (status === 'declined') patch.declined_at = now
    const { error: err } = await supabase.from('variations').update(patch).eq('id', v.id)
    setBusyId('')
    if (err) { setError(err.message); return }
    // Approving moves the job's invoiceable ceiling, so the financial stats and
    // the fully-invoiced lock banner above both need to re-render.
    router.refresh()
  }

  async function remove(v: Variation) {
    if (!confirm(`Delete ${v.variation_number}? This can't be undone.`)) return
    setBusyId(v.id)
    const { error: err } = await supabase.from('variations').delete().eq('id', v.id)
    setBusyId('')
    if (err) { setError(err.message); return }
    router.refresh()
  }

  async function copyLink(v: Variation) {
    const url = `${appUrl}/v/${v.public_token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(v.id)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setError(`Couldn't copy automatically. The link is ${url}`)
    }
  }

  const approvedTotal = variations
    .filter(v => v.status === 'approved')
    .reduce((s, v) => s + Number(v.total), 0)

  return (
    <div>
      {error && (
        <p className="mx-6 mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      {variations.length === 0 && !adding ? (
        <p className="px-6 py-4 text-sm text-gray-400">
          No variations. Raise one when the customer asks for work beyond the original quote.
        </p>
      ) : (
        <div className="divide-y divide-gray-50">
          {variations.map(v => (
            <div key={v.id} className="px-6 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-mono text-xs text-gray-400">{v.variation_number}</span>
                <span className="font-medium text-gray-800 flex-1 min-w-0">{v.title}</span>
                <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[v.status] ?? STATUS_STYLE.draft}`}>
                  {v.status}
                </span>
                <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(v.total)}</span>
              </div>

              {v.status === 'approved' && v.signed_by_name && (
                <p className="mt-1 text-xs text-green-700 flex items-center gap-1">
                  <PenLine className="h-3 w-3" /> Signed by {v.signed_by_name}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {['draft', 'sent'].includes(v.status) && (
                  <>
                    {v.status === 'draft' && (
                      <button onClick={() => setStatus(v, 'sent')} disabled={busyId === v.id} className="inline-flex items-center gap-1 font-medium text-orange-600 hover:text-orange-700 disabled:opacity-50">
                        <Send className="h-3 w-3" /> Mark as sent
                      </button>
                    )}
                    <button onClick={() => copyLink(v)} className="inline-flex items-center gap-1 font-medium text-gray-500 hover:text-gray-800">
                      <Link2 className="h-3 w-3" /> {copied === v.id ? 'Link copied' : 'Copy approval link'}
                    </button>
                    {/* For work agreed verbally on site — the customer signing at
                        /v/<token> is preferred, since that captures a signature. */}
                    <button onClick={() => setStatus(v, 'approved')} disabled={busyId === v.id} className="inline-flex items-center gap-1 font-medium text-green-700 hover:text-green-800 disabled:opacity-50">
                      <Check className="h-3 w-3" /> Mark approved
                    </button>
                    <button onClick={() => setStatus(v, 'declined')} disabled={busyId === v.id} className="inline-flex items-center gap-1 font-medium text-gray-400 hover:text-red-500 disabled:opacity-50">
                      <X className="h-3 w-3" /> Decline
                    </button>
                  </>
                )}
                {v.status === 'draft' && (
                  <button onClick={() => remove(v)} disabled={busyId === v.id} className="inline-flex items-center gap-1 text-gray-300 hover:text-red-400 disabled:opacity-50">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
                {v.status === 'approved' && (
                  <button onClick={() => setStatus(v, 'void')} disabled={busyId === v.id} className="inline-flex items-center gap-1 text-gray-400 hover:text-red-500 disabled:opacity-50">
                    <X className="h-3 w-3" /> Void
                  </button>
                )}
              </div>
            </div>
          ))}

          {approvedTotal > 0 && (
            <div className="px-6 py-2.5 flex justify-between text-sm bg-gray-50">
              <span className="font-medium text-gray-500">Approved variations</span>
              <span className="font-semibold text-gray-900 tabular-nums">+{formatCurrency(approvedTotal)}</span>
            </div>
          )}
        </div>
      )}

      {adding ? (
        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          <input
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm focus:border-orange-400 focus:outline-none"
            placeholder="What's the variation? e.g. Extra powerpoint in bedroom 2"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
            rows={2}
            placeholder="Any detail the customer should see (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="text-left font-medium pb-1">Description</th>
                <th className="text-right font-medium pb-1 w-20">Qty</th>
                <th className="text-left font-medium pb-1 w-20">Unit</th>
                <th className="text-right font-medium pb-1 w-28">Unit price</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="pr-2 py-1">
                    <input className="h-8 w-full rounded-lg border border-gray-200 px-2 text-sm" value={l.description} onChange={e => setLine(i, { description: e.target.value })} placeholder="Description..." />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" step="0.01" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input className="h-8 w-full rounded-lg border border-gray-200 px-2 text-sm" value={l.unit} onChange={e => setLine(i, { unit: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input type="number" step="0.01" className="h-8 w-full rounded-lg border border-gray-200 px-2 text-right text-sm" value={l.unit_price} onChange={e => setLine(i, { unit_price: e.target.value })} placeholder="0.00" />
                  </td>
                  <td className="py-1 pl-1">
                    {lines.length > 1 && (
                      <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button onClick={() => setLines(prev => [...prev, { ...BLANK_LINE }])} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-orange-600">
            <Plus className="h-3.5 w-3.5" /> Add line
          </button>

          <div className="flex justify-end gap-10 text-sm border-t border-gray-100 pt-2">
            <div className="text-right text-gray-500 space-y-0.5">
              <p>Subtotal</p><p>GST</p><p className="font-semibold text-gray-900">Total</p>
            </div>
            <div className="text-right tabular-nums space-y-0.5">
              <p className="text-gray-600">{formatCurrency(draftSubtotal)}</p>
              <p className="text-gray-600">{formatCurrency(draftGst)}</p>
              <p className="font-semibold text-gray-900">{formatCurrency(draftTotal)}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={save} disabled={saving || !title.trim() || filledLines.length === 0} className="px-3 py-1.5 text-xs font-medium bg-[var(--accent,#f97316)] text-white rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Create variation'}
            </button>
            <button onClick={reset} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="px-6 py-2">
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
            <Plus className="h-3.5 w-3.5" /> New variation
          </button>
        </div>
      )}
    </div>
  )
}
