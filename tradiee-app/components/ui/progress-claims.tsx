'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, FileText, CheckCircle, Clock, DollarSign } from 'lucide-react'

interface Claim {
  id: string
  stage_number: number
  name: string
  amount: number
  percentage: number | null
  status: 'pending' | 'invoiced' | 'paid'
  invoice_id: string | null
  due_date: string | null
  notes: string | null
}

interface Props {
  jobId: string
  companyId: string
  profileId: string
  jobTitle: string
  customerId: string
  gstRate: number
  nextInvoiceNumber: string
  initialClaims: Claim[]
  totalQuoted: number
}

const PRESETS = [
  { name: 'Deposit', pct: 30 },
  { name: 'Practical completion', pct: 50 },
  { name: 'Final payment', pct: 20 },
]

const STATUS_CONFIG = {
  pending: { icon: Clock, label: 'Pending', color: 'text-gray-500 bg-gray-50', dot: 'bg-gray-300' },
  invoiced: { icon: FileText, label: 'Invoiced', color: 'text-blue-600 bg-blue-50', dot: 'bg-blue-400' },
  paid: { icon: CheckCircle, label: 'Paid', color: 'text-green-600 bg-green-50', dot: 'bg-green-400' },
}

export function ProgressClaims({
  jobId, companyId, profileId, jobTitle, customerId, gstRate,
  nextInvoiceNumber, initialClaims, totalQuoted,
}: Props) {
  const [claims, setClaims] = useState<Claim[]>(initialClaims.sort((a, b) => a.stage_number - b.stage_number))
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [invoiceNumCounter, setInvoiceNumCounter] = useState(nextInvoiceNumber)
  const supabase = createClient()

  const nextStageNum = (claims[claims.length - 1]?.stage_number ?? 0) + 1

  async function addClaim() {
    if (!newName.trim() || !newAmount) return
    const amount = parseFloat(newAmount)
    const pct = totalQuoted > 0 ? (amount / totalQuoted) * 100 : null
    const { data } = await supabase.from('progress_claims').insert({
      job_id: jobId,
      company_id: companyId,
      stage_number: nextStageNum,
      name: newName.trim(),
      amount,
      percentage: pct,
      due_date: newDueDate || null,
    }).select('*').single()
    if (data) {
      setClaims(prev => [...prev, data as Claim])
      setNewName('')
      setNewAmount('')
      setNewDueDate('')
      setAdding(false)
    }
  }

  async function applyPresets() {
    if (totalQuoted === 0 || claims.length > 0) return
    const rows = PRESETS.map((p, i) => ({
      job_id: jobId,
      company_id: companyId,
      stage_number: i + 1,
      name: p.name,
      amount: Math.round((totalQuoted * p.pct / 100) * 100) / 100,
      percentage: p.pct,
    }))
    const { data } = await supabase.from('progress_claims').insert(rows).select('*')
    if (data) setClaims(data as Claim[])
  }

  async function deleteClaim(id: string) {
    await supabase.from('progress_claims').delete().eq('id', id)
    setClaims(prev => prev.filter(c => c.id !== id))
  }

  async function createInvoice(claim: Claim) {
    // Create an invoice for this claim stage
    const subtotal = claim.amount
    const gst = subtotal * gstRate
    const total = subtotal + gst

    const { data: inv } = await supabase.from('invoices').insert({
      job_id: jobId,
      company_id: companyId,
      customer_id: customerId,
      invoice_number: invoiceNumCounter,
      status: 'draft',
      subtotal,
      gst,
      total,
      amount_paid: 0,
      due_date: claim.due_date ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      notes: `Progress claim: ${claim.name}`,
    }).select('id').single()

    if (!inv) return

    // Link claim to invoice
    await supabase.from('progress_claims').update({ status: 'invoiced', invoice_id: inv.id }).eq('id', claim.id)
    setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, status: 'invoiced', invoice_id: inv.id } : c))

    // Bump invoice number counter optimistically
    const parts = invoiceNumCounter.split('-')
    const n = parseInt(parts[1] ?? '0') + 1
    setInvoiceNumCounter(`INV-${String(n).padStart(4, '0')}`)
  }

  const totalClaimed = claims.reduce((s, c) => s + c.amount, 0)
  const totalPaid = claims.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0)
  const totalInvoiced = claims.filter(c => c.status === 'invoiced').reduce((s, c) => s + c.amount, 0)

  return (
    <div>
      {/* Summary bar */}
      {claims.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-gray-400">Total claims</p>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalClaimed)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Invoiced</p>
            <p className="text-sm font-semibold text-blue-600">{formatCurrency(totalInvoiced)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Collected</p>
            <p className="text-sm font-semibold text-green-600">{formatCurrency(totalPaid)}</p>
          </div>
        </div>
      )}

      {/* Claim stages */}
      <div className="divide-y divide-gray-50">
        {claims.map((claim, idx) => {
          const cfg = STATUS_CONFIG[claim.status]
          const Icon = cfg.icon
          return (
            <div key={claim.id} className="flex items-center gap-3 px-4 py-3">
              {/* Stage indicator */}
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${cfg.color}`}>
                  {idx + 1}
                </div>
                {idx < claims.length - 1 && <div className="w-px h-4 bg-gray-200 mt-1" />}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">{claim.name}</p>
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-sm font-semibold text-gray-800">{formatCurrency(claim.amount)}</p>
                  {claim.percentage && <span className="text-xs text-gray-400">{claim.percentage.toFixed(0)}% of job</span>}
                  {claim.due_date && <span className="text-xs text-gray-400">Due {new Date(claim.due_date).toLocaleDateString('en-NZ')}</span>}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {claim.status === 'pending' && (
                  <button
                    onClick={() => createInvoice(claim)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <DollarSign className="h-3.5 w-3.5" /> Invoice
                  </button>
                )}
                {claim.status === 'invoiced' && claim.invoice_id && (
                  <a
                    href={`/invoices/${claim.invoice_id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" /> View invoice
                  </a>
                )}
                {claim.status === 'pending' && (
                  <button onClick={() => deleteClaim(claim.id)} className="text-gray-300 hover:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add controls */}
      {adding ? (
        <div className="px-4 py-3 border-t border-gray-100 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Stage name</label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Rough-in complete"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Amount (excl. GST)</label>
              <input
                type="number"
                value={newAmount}
                onChange={e => setNewAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Due date (optional)</label>
            <input
              type="date"
              value={newDueDate}
              onChange={e => setNewDueDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50">Cancel</button>
            <button onClick={addClaim} disabled={!newName.trim() || !newAmount} className="px-4 py-1.5 bg-[var(--accent,#f97316)] text-white text-xs font-medium rounded-lg hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-40">Add stage</button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm text-orange-500 hover:text-[var(--accent,#f97316)] font-medium"
          >
            <Plus className="h-4 w-4" /> Add stage
          </button>
          {claims.length === 0 && totalQuoted > 0 && (
            <button
              onClick={applyPresets}
              className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 rounded-lg px-3 py-1.5"
            >
              Use 30/50/20 preset
            </button>
          )}
        </div>
      )}
    </div>
  )
}
