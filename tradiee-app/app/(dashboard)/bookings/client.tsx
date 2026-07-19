'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, Package, Clock, Ban, CalendarCheck } from 'lucide-react'

type BookablePackage = {
  id: string; name: string; description: string | null; duration_minutes: number
  buffer_before_minutes: number; buffer_after_minutes: number; price: number
  requires_deposit: boolean; is_active: boolean; kit_id: string | null; price_list_item_id: string | null
}
type BookingSettings = { timezone: string; min_notice_hours: number; max_days_ahead: number; slot_interval_minutes: number } | null
type AvailabilityRule = { id: string; day_of_week: number; starts_at: string; ends_at: string; profile_id: string | null }
type Blackout = { id: string; starts_at: string; ends_at: string; reason: string | null; profile_id: string | null }
type Booking = {
  id: string; status: string; customer_name: string; customer_email: string | null; customer_phone: string | null
  site_address: string | null; notes: string | null; starts_at: string; ends_at: string
  deposit_required: number; deposit_paid: number; deposit_refunded: number; stripe_payment_intent_id: string | null
  bookable_packages: { name: string } | null
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'
const REFUND_WINDOW_HOURS = 24

export function BookingsClient({
  companyId, entitled, packages: initialPackages, settings: initialSettings, rules: initialRules,
  blackouts: initialBlackouts, kits, priceItems, bookings: initialBookings, websiteSlug,
}: {
  companyId: string
  entitled: boolean
  packages: BookablePackage[]
  settings: BookingSettings
  rules: AvailabilityRule[]
  blackouts: Blackout[]
  kits: { id: string; name: string }[]
  priceItems: { id: string; name: string }[]
  bookings: Booking[]
  websiteSlug: string | null
}) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [tab, setTab] = useState<'requests' | 'packages' | 'hours' | 'blackouts'>('requests')
  const [bookings, setBookings] = useState(initialBookings)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [packages, setPackages] = useState(initialPackages)
  const [rules, setRules] = useState(initialRules)
  const [blackouts, setBlackouts] = useState(initialBlackouts)
  const [settings, setSettings] = useState<BookingSettings>(initialSettings ?? { timezone: 'Pacific/Auckland', min_notice_hours: 12, max_days_ahead: 45, slot_interval_minutes: 30 })
  const [showNewPackage, setShowNewPackage] = useState(false)
  const [newPkg, setNewPkg] = useState({ name: '', duration_minutes: '60', price: '0', kit_id: '', price_list_item_id: '' })
  const [showNewBlackout, setShowNewBlackout] = useState(false)
  const [newBlackout, setNewBlackout] = useState({ starts_at: '', ends_at: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [embedId, setEmbedId] = useState<string | null>(null)

  // <iframe> snippet a tradie pastes into their own website. Points at the public
  // booking widget, which stays gated server-side by the bookings_website add-on.
  function embedCode(pkgId: string) {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `<iframe src="${origin}/site/${websiteSlug}/book/${pkgId}" width="100%" height="720" style="border:0;max-width:480px;border-radius:12px" title="Book online" loading="lazy"></iframe>`
  }

  if (!entitled) {
    return (
      <div className="p-6 max-w-xl">
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <Package className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <h2 className="font-semibold text-gray-900 mb-1">Bookings requires the add-on</h2>
          <p className="text-sm text-gray-500">Enable it from the <a href="/website" className="text-[var(--accent,#f97316)] hover:underline">Website</a> page — publishing, custom hosting and bookings are all part of the $19/mo Bookings Website add-on.</p>
        </div>
      </div>
    )
  }

  async function createPackage() {
    if (!newPkg.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('bookable_packages').insert({
      company_id: companyId,
      name: newPkg.name.trim(),
      duration_minutes: parseInt(newPkg.duration_minutes) || 60,
      price: parseFloat(newPkg.price) || 0,
      kit_id: newPkg.kit_id || null,
      price_list_item_id: newPkg.price_list_item_id || null,
      sort_order: packages.length,
    }).select().single()
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setPackages(p => [...p, data])
    setNewPkg({ name: '', duration_minutes: '60', price: '0', kit_id: '', price_list_item_id: '' })
    setShowNewPackage(false)
    toast('Package created')
  }

  async function togglePackageActive(pkg: BookablePackage) {
    const { error } = await supabase.from('bookable_packages').update({ is_active: !pkg.is_active }).eq('id', pkg.id)
    if (error) { toast(error.message, 'error'); return }
    setPackages(p => p.map(x => x.id === pkg.id ? { ...x, is_active: !x.is_active } : x))
  }

  async function deletePackage(id: string) {
    if (!confirm('Delete this package?')) return
    const { error } = await supabase.from('bookable_packages').delete().eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setPackages(p => p.filter(x => x.id !== id))
  }

  async function saveSettings() {
    setSaving(true)
    const { error } = await supabase.from('booking_settings').upsert({ company_id: companyId, ...settings }, { onConflict: 'company_id' })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Hours settings saved')
    router.refresh()
  }

  async function addRule(dayOfWeek: number) {
    const { data, error } = await supabase.from('booking_availability_rules').insert({
      company_id: companyId, day_of_week: dayOfWeek, starts_at: '09:00', ends_at: '17:00', profile_id: null,
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    setRules(r => [...r, data])
  }

  async function updateRule(id: string, patch: Partial<AvailabilityRule>) {
    setRules(r => r.map(x => x.id === id ? { ...x, ...patch } : x))
    await supabase.from('booking_availability_rules').update(patch).eq('id', id)
  }

  async function removeRule(id: string) {
    await supabase.from('booking_availability_rules').delete().eq('id', id)
    setRules(r => r.filter(x => x.id !== id))
  }

  async function createBlackout() {
    if (!newBlackout.starts_at || !newBlackout.ends_at) return
    setSaving(true)
    const { data, error } = await supabase.from('booking_blackouts').insert({
      company_id: companyId,
      starts_at: new Date(newBlackout.starts_at).toISOString(),
      ends_at: new Date(newBlackout.ends_at).toISOString(),
      reason: newBlackout.reason || null,
      profile_id: null,
    }).select().single()
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setBlackouts(b => [...b, data].sort((a, c) => a.starts_at.localeCompare(c.starts_at)))
    setNewBlackout({ starts_at: '', ends_at: '', reason: '' })
    setShowNewBlackout(false)
  }

  async function removeBlackout(id: string) {
    await supabase.from('booking_blackouts').delete().eq('id', id)
    setBlackouts(b => b.filter(x => x.id !== id))
  }

  async function bookingAction(id: string, action: 'confirm' | 'cancel' | 'no_show') {
    setBusyId(id)
    const res = await fetch(`/api/bookings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
    })
    const data = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) { toast(data.error ?? 'Could not update booking', 'error'); return }
    router.refresh()
    const status = action === 'confirm' ? 'confirmed' : action === 'cancel' ? 'cancelled' : 'no_show'
    setBookings(b => b.map(x => x.id === id ? { ...x, status } : x))
  }

  async function refundDeposit(id: string) {
    if (!confirm('Refund this deposit?')) return
    setBusyId(id)
    const res = await fetch('/api/bookings/refund', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: id }),
    })
    const data = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) { toast(data.error ?? 'Could not refund', 'error'); return }
    toast('Deposit refunded')
    router.refresh()
    setBookings(b => b.map(x => x.id === id ? { ...x, deposit_refunded: x.deposit_paid } : x))
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {(['requests', 'packages', 'hours', 'blackouts'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'requests' && (
        <div className="space-y-3">
          {bookings.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
              <CalendarCheck className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              No bookings yet.
            </div>
          )}
          {bookings.map(b => {
            const refundable = Number(b.deposit_paid) - Number(b.deposit_refunded)
            const hoursBeforeStart = (new Date(b.starts_at).getTime() - Date.now()) / 3600000
            const canRefund = refundable > 0 && ['cancelled', 'no_show'].includes(b.status) && b.status !== 'no_show' && hoursBeforeStart >= REFUND_WINDOW_HOURS
            return (
              <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{b.bookable_packages?.name ?? 'Booking'}</p>
                      <span className={`text-[10px] font-semibold uppercase rounded-full px-2 py-0.5 ${
                        b.status === 'confirmed' || b.status === 'scheduled' ? 'bg-green-100 text-green-700'
                        : b.status === 'requested' || b.status === 'deposit_pending' ? 'bg-amber-100 text-amber-700'
                        : b.status === 'cancelled' || b.status === 'no_show' ? 'bg-gray-100 text-gray-500'
                        : 'bg-gray-100 text-gray-500'
                      }`}>{b.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{b.customer_name} · {b.customer_email || b.customer_phone}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{new Date(b.starts_at).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                    {b.site_address && <p className="text-xs text-gray-400">{b.site_address}</p>}
                    {b.notes && <p className="text-xs text-amber-600 mt-1">{b.notes}</p>}
                    {Number(b.deposit_required) > 0 && (
                      <p className="text-xs text-gray-400 mt-1">Deposit: ${Number(b.deposit_paid).toFixed(2)} paid of ${Number(b.deposit_required).toFixed(2)}{Number(b.deposit_refunded) > 0 && ` · $${Number(b.deposit_refunded).toFixed(2)} refunded`}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {['requested', 'deposit_pending'].includes(b.status) && (
                      <button disabled={busyId === b.id} onClick={() => bookingAction(b.id, 'confirm')} className="text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50">Confirm</button>
                    )}
                    {!['cancelled', 'no_show', 'completed'].includes(b.status) && (
                      <button disabled={busyId === b.id} onClick={() => bookingAction(b.id, 'no_show')} className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50">No-show</button>
                    )}
                    {!['cancelled', 'no_show', 'completed'].includes(b.status) && (
                      <button disabled={busyId === b.id} onClick={() => bookingAction(b.id, 'cancel')} className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50">Cancel</button>
                    )}
                    {refundable > 0 && ['cancelled', 'no_show'].includes(b.status) && (
                      <button
                        disabled={busyId === b.id || !canRefund}
                        title={!canRefund ? `Forfeited — refund only allowed >${REFUND_WINDOW_HOURS}h before the booking` : undefined}
                        onClick={() => refundDeposit(b.id)}
                        className="text-xs font-medium text-[var(--accent,#f97316)] hover:underline disabled:opacity-40 disabled:no-underline"
                      >Refund ${refundable.toFixed(2)}</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'packages' && (
        <div className="space-y-3">
          {packages.map(pkg => (
            <div key={pkg.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{pkg.name}</p>
                    {!pkg.is_active && <span className="text-[10px] font-semibold uppercase text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">Inactive</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{pkg.duration_minutes} min · ${Number(pkg.price).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-3">
                  {websiteSlug && pkg.is_active && (
                    <>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/site/${websiteSlug}/book/${pkg.id}`)
                          toast('Booking link copied')
                        }}
                        className="text-xs font-medium text-[var(--accent,#f97316)] hover:underline"
                      >Copy link</button>
                      <button
                        onClick={() => setEmbedId(id => id === pkg.id ? null : pkg.id)}
                        className="text-xs font-medium text-[var(--accent,#f97316)] hover:underline"
                      >{embedId === pkg.id ? 'Hide embed' : 'Embed'}</button>
                    </>
                  )}
                  <button onClick={() => togglePackageActive(pkg)} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                    {pkg.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => deletePackage(pkg.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>

              {embedId === pkg.id && websiteSlug && (
                <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
                  <p className="text-xs text-gray-600">
                    Paste this into your own website to embed the booking form. It keeps working as long as your Bookings subscription is active.
                  </p>
                  <textarea
                    readOnly
                    onFocus={e => e.currentTarget.select()}
                    value={embedCode(pkg.id)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-[11px] text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={() => { navigator.clipboard.writeText(embedCode(pkg.id)); toast('Embed code copied') }}
                    className="rounded-lg bg-[var(--accent,#f97316)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >Copy code</button>
                  <p className="text-[11px] text-gray-400">Tip: adjust <span className="font-mono">height</span> if the form is cut off, or <span className="font-mono">max-width</span> to change how wide it sits.</p>
                </div>
              )}
            </div>
          ))}

          {showNewPackage ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <input value={newPkg.name} onChange={e => setNewPkg(p => ({ ...p, name: e.target.value }))} placeholder="Package name (e.g. Standard callout)" className={inputCls} autoFocus />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Duration (min)</label>
                  <input type="number" value={newPkg.duration_minutes} onChange={e => setNewPkg(p => ({ ...p, duration_minutes: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Price ($)</label>
                  <input type="number" step="0.01" value={newPkg.price} onChange={e => setNewPkg(p => ({ ...p, price: e.target.value }))} className={inputCls} />
                </div>
              </div>
              {kits.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From a kit (optional)</label>
                  <select value={newPkg.kit_id} onChange={e => setNewPkg(p => ({ ...p, kit_id: e.target.value }))} className={inputCls}>
                    <option value="">— None —</option>
                    {kits.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </div>
              )}
              {priceItems.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From a price list item (optional)</label>
                  <select value={newPkg.price_list_item_id} onChange={e => setNewPkg(p => ({ ...p, price_list_item_id: e.target.value }))} className={inputCls}>
                    <option value="">— None —</option>
                    {priceItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={createPackage} disabled={saving || !newPkg.name.trim()} className="rounded-lg bg-[var(--accent,#f97316)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create</button>
                <button onClick={() => setShowNewPackage(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewPackage(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-orange-400 hover:text-[var(--accent,#f97316)]">
              <Plus className="h-4 w-4" /> Add package
            </button>
          )}
        </div>
      )}

      {tab === 'hours' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Timezone</label>
              <input value={settings?.timezone ?? ''} onChange={e => setSettings(s => ({ ...s!, timezone: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min notice (hours)</label>
              <input type="number" value={settings?.min_notice_hours ?? 12} onChange={e => setSettings(s => ({ ...s!, min_notice_hours: parseInt(e.target.value) || 0 }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Book up to (days ahead)</label>
              <input type="number" value={settings?.max_days_ahead ?? 45} onChange={e => setSettings(s => ({ ...s!, max_days_ahead: parseInt(e.target.value) || 0 }))} className={inputCls} />
            </div>
          </div>
          <button onClick={saveSettings} disabled={saving} className="rounded-lg bg-[var(--accent,#f97316)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save settings</button>

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {DAYS.map((day, dow) => {
              const dayRules = rules.filter(r => r.day_of_week === dow)
              return (
                <div key={dow} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                  <span className="w-24 text-sm font-medium text-gray-700 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-gray-400" /> {day}</span>
                  <div className="flex-1 flex flex-wrap gap-2">
                    {dayRules.map(rule => (
                      <div key={rule.id} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1">
                        <input type="time" value={rule.starts_at.slice(0, 5)} onChange={e => updateRule(rule.id, { starts_at: e.target.value })} className="text-xs border-0 bg-transparent focus:outline-none" />
                        <span className="text-gray-300">–</span>
                        <input type="time" value={rule.ends_at.slice(0, 5)} onChange={e => updateRule(rule.id, { ends_at: e.target.value })} className="text-xs border-0 bg-transparent focus:outline-none" />
                        <button onClick={() => removeRule(rule.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                    <button onClick={() => addRule(dow)} className="text-xs text-[var(--accent,#f97316)] hover:underline">+ Add hours</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'blackouts' && (
        <div className="space-y-3">
          {blackouts.map(b => (
            <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-900">{new Date(b.starts_at).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })} – {new Date(b.ends_at).toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  {b.reason && <p className="text-xs text-gray-400">{b.reason}</p>}
                </div>
              </div>
              <button onClick={() => removeBlackout(b.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}

          {showNewBlackout ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                  <input type="datetime-local" value={newBlackout.starts_at} onChange={e => setNewBlackout(b => ({ ...b, starts_at: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                  <input type="datetime-local" value={newBlackout.ends_at} onChange={e => setNewBlackout(b => ({ ...b, ends_at: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <input value={newBlackout.reason} onChange={e => setNewBlackout(b => ({ ...b, reason: e.target.value }))} placeholder="Reason (optional, e.g. Public holiday)" className={inputCls} />
              <div className="flex gap-2">
                <button onClick={createBlackout} disabled={saving} className="rounded-lg bg-[var(--accent,#f97316)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add blackout</button>
                <button onClick={() => setShowNewBlackout(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewBlackout(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-orange-400 hover:text-[var(--accent,#f97316)]">
              <Plus className="h-4 w-4" /> Add blackout period
            </button>
          )}
        </div>
      )}
    </div>
  )
}
