'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Company, Profile } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { BillingRatesManager, PaymentMethodsManager, TaxRatesManager, EnquiryInboxManager } from '@/components/forms/company-lists'
import { Upload, Pencil, X, ArrowRightLeft, PenLine, Trash2 } from 'lucide-react'

interface Props {
  profile: Profile & { companies: Company }
  company: Company
  team: Profile[]
  googleConnected: boolean
}

export function SettingsClient({ profile, company, team: initialTeam, googleConnected: initialGoogleConnected }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [tab, setTab] = useState<'company' | 'profile' | 'team' | 'integrations' | 'billing'>('company')
  const [loading, setLoading] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editMember, setEditMember] = useState<Profile | null>(null)
  const [team, setTeam] = useState<Profile[]>(initialTeam)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logo_url ?? null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(initialGoogleConnected)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false)

  const [companyForm, setCompanyForm] = useState({
    name: company.name ?? '',
    trade_type: company.trade_type ?? '',
    email: company.email ?? '',
    phone: company.phone ?? '',
    address: company.address ?? '',
    gst_number: company.gst_number ?? '',
    default_gst_rate: ((company.default_gst_rate ?? 0.15) * 100).toString(),
    country: company.country ?? 'NZ',
    default_terms: (company as Company & { default_terms?: string }).default_terms ?? '',
    quote_prefix: (company as Company & { quote_prefix?: string }).quote_prefix ?? 'Q-',
    invoice_prefix: (company as Company & { invoice_prefix?: string }).invoice_prefix ?? 'INV-',
    job_prefix: (company as Company & { job_prefix?: string }).job_prefix ?? 'J-',
    po_prefix: (company as Company & { po_prefix?: string }).po_prefix ?? 'PO-',
    prices_include_tax: (company as Company & { prices_include_tax?: boolean }).prices_include_tax ?? false,
    payment_instructions: (company as Company & { payment_instructions?: string }).payment_instructions ?? '',
    invoice_footer: (company as Company & { invoice_footer?: string }).invoice_footer ?? '',
    quote_footer: (company as Company & { quote_footer?: string }).quote_footer ?? '',
  })

  const [profileForm, setProfileForm] = useState({
    full_name: profile.full_name ?? '',
    phone: profile.phone ?? '',
    hourly_bill_rate: profile.hourly_bill_rate?.toString() ?? '',
    hourly_cost_rate: profile.hourly_cost_rate?.toString() ?? '',
    lbp_number: (profile as unknown as Record<string, unknown>).lbp_number as string ?? '',
    cpeng_number: (profile as unknown as Record<string, unknown>).cpeng_number as string ?? '',
    council: ((profile as unknown as Record<string, unknown>).council as string) ?? 'auckland',
  })
  const [signatureB64, setSignatureB64] = useState<string | null>(
    ((profile as unknown as Record<string, unknown>).signature_base64 as string | null) ?? null
  )
  const [sigModalOpen, setSigModalOpen] = useState(false)

  const [inviteForm, setInviteForm] = useState({
    email: '', full_name: '', role: 'staff',
    hourly_bill_rate: '', hourly_cost_rate: '',
  })

  const [editForm, setEditForm] = useState({
    role: 'staff', hourly_bill_rate: '', hourly_cost_rate: '', is_active: true,
  })

  function setC(k: string, v: string) { setCompanyForm(f => ({ ...f, [k]: v })) }
  function setP(k: keyof typeof profileForm, v: string) { setProfileForm(f => ({ ...f, [k]: v })) }

  async function uploadLogo(file: File) {
    setLogoUploading(true)
    const ext = file.name.split('.').pop() ?? 'png'

    const res = await fetch('/api/storage/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'company-logo', ext, contentType: file.type }),
    })
    if (!res.ok) { toast((await res.json()).error ?? 'Upload failed', 'error'); setLogoUploading(false); return }
    const { url, publicUrl } = await res.json()

    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
    if (!put.ok) { toast('Upload to storage failed', 'error'); setLogoUploading(false); return }

    // Cache-bust so the new logo shows immediately (key is stable per company)
    const bustedUrl = `${publicUrl}?v=${Date.now()}`
    const { error: dbErr } = await supabase.from('companies').update({ logo_url: bustedUrl }).eq('id', company.id)
    if (dbErr) { toast(dbErr.message, 'error'); setLogoUploading(false); return }
    setLogoPreview(bustedUrl)
    toast('Logo updated')
    setLogoUploading(false)
  }

  async function removeLogo() {
    await supabase.from('companies').update({ logo_url: null }).eq('id', company.id)
    setLogoPreview(null)
    toast('Logo removed')
  }

  async function syncGoogleCalendar() {
    setGoogleSyncing(true)
    try {
      const res = await fetch('/api/google/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error ?? 'Sync failed', 'error')
      } else {
        toast(`Synced ${data.synced} visit${data.synced !== 1 ? 's' : ''} to Google Calendar`)
      }
    } catch {
      toast('Sync failed — please try again', 'error')
    } finally {
      setGoogleSyncing(false)
    }
  }

  async function disconnectGoogleCalendar() {
    setGoogleDisconnecting(true)
    try {
      const res = await fetch('/api/google/disconnect', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        toast(data.error ?? 'Failed to disconnect', 'error')
      } else {
        setGoogleConnected(false)
        toast('Google Calendar disconnected')
      }
    } catch {
      toast('Failed to disconnect — please try again', 'error')
    } finally {
      setGoogleDisconnecting(false)
    }
  }

  async function saveCompany(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('companies').update({
      ...companyForm,
      default_gst_rate: parseFloat(companyForm.default_gst_rate) / 100,
      default_terms: companyForm.default_terms || null,
    }).eq('id', company.id)
    if (error) toast(error.message, 'error')
    else { toast('Company settings saved'); router.refresh() }
    setLoading(false)
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('profiles').update({
      full_name: profileForm.full_name,
      phone: profileForm.phone || null,
      hourly_bill_rate: profileForm.hourly_bill_rate ? parseFloat(profileForm.hourly_bill_rate) : null,
      hourly_cost_rate: profileForm.hourly_cost_rate ? parseFloat(profileForm.hourly_cost_rate) : null,
      lbp_number: profileForm.lbp_number || null,
      cpeng_number: profileForm.cpeng_number || null,
      council: profileForm.council || 'auckland',
      signature_base64: signatureB64 || null,
    } as Record<string, unknown>).eq('id', profile.id)
    if (error) toast(error.message, 'error')
    else { toast('Profile saved'); router.refresh() }
    setLoading(false)
  }

  async function clearSignature() {
    setSignatureB64(null)
  }

  async function inviteTeamMember(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await fetch('/api/auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: inviteForm.full_name,
        email: inviteForm.email,
        role: inviteForm.role,
        hourly_bill_rate: inviteForm.hourly_bill_rate ? parseFloat(inviteForm.hourly_bill_rate) : null,
        hourly_cost_rate: inviteForm.hourly_cost_rate ? parseFloat(inviteForm.hourly_cost_rate) : null,
        companyId: company.id,
      }),
    })
    const data = await res.json()
    if (!res.ok) { toast(data.error ?? 'Failed to invite', 'error'); setLoading(false); return }
    toast(`Team member added. Temp password: ${data.tempPassword}`)
    setInviteOpen(false)
    setInviteForm({ email: '', full_name: '', role: 'staff', hourly_bill_rate: '', hourly_cost_rate: '' })
    // Fetch the newly created profile so they appear immediately without a page reload
    const { data: newProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', inviteForm.email)
      .eq('company_id', company.id)
      .single()
    if (newProfile) setTeam(prev => [...prev, newProfile as Profile])
    setLoading(false)
  }

  function openEdit(member: Profile) {
    setEditMember(member)
    setEditForm({
      role: member.role ?? 'staff',
      hourly_bill_rate: member.hourly_bill_rate?.toString() ?? '',
      hourly_cost_rate: member.hourly_cost_rate?.toString() ?? '',
      is_active: member.is_active ?? true,
    })
  }

  async function saveEditMember(e: React.FormEvent) {
    e.preventDefault()
    if (!editMember) return
    setLoading(true)
    const { error } = await supabase.from('profiles').update({
      role: editForm.role,
      hourly_bill_rate: editForm.hourly_bill_rate ? parseFloat(editForm.hourly_bill_rate) : null,
      hourly_cost_rate: editForm.hourly_cost_rate ? parseFloat(editForm.hourly_cost_rate) : null,
      is_active: editForm.is_active,
    }).eq('id', editMember.id)
    if (error) { toast(error.message, 'error'); setLoading(false); return }
    setTeam(prev => prev.map(m => m.id === editMember.id
      ? { ...m, role: editForm.role as Profile['role'], hourly_bill_rate: editForm.hourly_bill_rate ? parseFloat(editForm.hourly_bill_rate) : null, hourly_cost_rate: editForm.hourly_cost_rate ? parseFloat(editForm.hourly_cost_rate) : null, is_active: editForm.is_active }
      : m
    ))
    toast('Team member updated')
    setEditMember(null)
    setLoading(false)
  }

  const planLabel: Record<string, string> = { trial: 'Trial', solo: 'Solo (1 user)', team: 'Team (up to 10)', pro: 'Pro (unlimited)' }

  return (
    <div className="p-6">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {(['company', 'profile', 'team', 'integrations', 'billing'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'company' && (
        <Card className="max-w-2xl">
          <CardHeader><CardTitle>Business settings</CardTitle></CardHeader>
          <CardContent>
            {/* Plan */}
            <div className="flex items-center gap-3 mb-6 p-3 bg-orange-50 rounded-lg border border-orange-100">
              <div>
                <p className="text-sm font-medium text-orange-800">Current plan: <strong>{planLabel[company.subscription_plan] ?? company.subscription_plan}</strong></p>
                <p className="text-xs text-orange-600">Status: {company.subscription_status}</p>
              </div>
            </div>

            {/* Logo */}
            <div className="mb-6">
              <Label>Company logo</Label>
              <p className="text-xs text-gray-400 mb-2">Appears on quotes, invoices, and job sheets</p>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoPreview} alt="Company logo" className="h-16 w-auto max-w-[200px] object-contain border border-gray-200 rounded-lg p-1 bg-white" />
                    <button
                      onClick={removeLogo}
                      className="absolute -top-2 -right-2 bg-white border border-gray-200 rounded-full p-0.5 hover:bg-red-50 hover:border-red-200 transition-colors"
                    >
                      <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-400" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-32 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400">
                    No logo
                  </div>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }}
                />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {logoUploading ? 'Uploading...' : logoPreview ? 'Change logo' : 'Upload logo'}
                </button>
              </div>
            </div>

            <form onSubmit={saveCompany} className="space-y-4">
              <div><Label>Business name <span className="text-red-400">*</span></Label><Input value={companyForm.name} onChange={e => setC('name', e.target.value)} required /></div>
              <div><Label>Trade type</Label><Input value={companyForm.trade_type} onChange={e => setC('trade_type', e.target.value)} placeholder="e.g. Electrician" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input type="email" value={companyForm.email} onChange={e => setC('email', e.target.value)} /></div>
                <div><Label>Phone</Label><Input value={companyForm.phone} onChange={e => setC('phone', e.target.value)} /></div>
              </div>
              <div><Label>Address</Label><Input value={companyForm.address} onChange={e => setC('address', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>GST number</Label><Input value={companyForm.gst_number} onChange={e => setC('gst_number', e.target.value)} /></div>
                <div><Label>GST rate (%)</Label><Input type="number" step="0.01" value={companyForm.default_gst_rate} onChange={e => setC('default_gst_rate', e.target.value)} /></div>
              </div>
              <div><Label>Country</Label>
                <Select value={companyForm.country} onChange={e => setC('country', e.target.value)} options={[{ value: 'NZ', label: 'New Zealand' }, { value: 'AU', label: 'Australia' }]} />
              </div>
              <div>
                <Label>Default terms & conditions</Label>
                <Textarea value={companyForm.default_terms} onChange={e => setC('default_terms', e.target.value)} rows={6} placeholder="Enter your standard payment terms, warranty clauses, or any default conditions that appear on quotes..." />
                <p className="text-xs text-gray-400 mt-1">Auto-populated on new quotes. Can be edited per quote.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={companyForm.prices_include_tax} onChange={e => setCompanyForm(f => ({ ...f, prices_include_tax: e.target.checked }))} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                Prices include GST (tax-inclusive entry on quotes &amp; invoices)
              </label>
              <div>
                <Label>Document number prefixes</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><span className="text-xs text-gray-400">Quotes</span><Input value={companyForm.quote_prefix} onChange={e => setC('quote_prefix', e.target.value)} /></div>
                  <div><span className="text-xs text-gray-400">Invoices</span><Input value={companyForm.invoice_prefix} onChange={e => setC('invoice_prefix', e.target.value)} /></div>
                  <div><span className="text-xs text-gray-400">Jobs</span><Input value={companyForm.job_prefix} onChange={e => setC('job_prefix', e.target.value)} /></div>
                  <div><span className="text-xs text-gray-400">Purchase orders</span><Input value={companyForm.po_prefix} onChange={e => setC('po_prefix', e.target.value)} /></div>
                </div>
                <p className="text-xs text-gray-400 mt-1">Applied to newly created documents, e.g. {companyForm.quote_prefix}0001.</p>
              </div>
              <div>
                <Label>Payment instructions</Label>
                <Textarea value={companyForm.payment_instructions} onChange={e => setC('payment_instructions', e.target.value)} rows={2} placeholder="e.g. Direct credit to 12-3456-7890123-00, reference your invoice number." />
                <p className="text-xs text-gray-400 mt-1">Shown to customers on the online invoice.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Invoice footer</Label><Textarea value={companyForm.invoice_footer} onChange={e => setC('invoice_footer', e.target.value)} rows={2} placeholder="Thanks for your business!" /></div>
                <div><Label>Quote footer</Label><Textarea value={companyForm.quote_footer} onChange={e => setC('quote_footer', e.target.value)} rows={2} placeholder="We look forward to working with you." /></div>
              </div>
              <Button type="submit" loading={loading}>Save settings</Button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-8">
              <TaxRatesManager companyId={company.id} />
              <BillingRatesManager companyId={company.id} />
              <PaymentMethodsManager companyId={company.id} />
              <EnquiryInboxManager companyId={company.id} initialToken={(company as Company & { inbound_email_token?: string | null }).inbound_email_token ?? null} />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'profile' && (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>My profile</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div><Label>Full name <span className="text-red-400">*</span></Label><Input value={profileForm.full_name} onChange={e => setP('full_name', e.target.value)} required /></div>
              <div><Label>Phone</Label><Input value={profileForm.phone} onChange={e => setP('phone', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Bill rate ($/hr)</Label>
                  <Input type="number" step="0.01" value={profileForm.hourly_bill_rate} onChange={e => setP('hourly_bill_rate', e.target.value)} placeholder="Charge-out rate" />
                  <p className="text-xs text-gray-400 mt-1">Used on timesheets &amp; invoices</p>
                </div>
                <div>
                  <Label>Cost rate ($/hr)</Label>
                  <Input type="number" step="0.01" value={profileForm.hourly_cost_rate} onChange={e => setP('hourly_cost_rate', e.target.value)} placeholder="Cost to business" />
                  <p className="text-xs text-gray-400 mt-1">Used for job profitability</p>
                </div>
              </div>

              {/* Compliance / registration fields */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-3">Compliance &amp; registration (NZ)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>LBP number</Label>
                    <Input value={profileForm.lbp_number} onChange={e => setP('lbp_number', e.target.value)} placeholder="e.g. LBP 123456" />
                    <p className="text-xs text-gray-400 mt-1">Licensed Building Practitioner</p>
                  </div>
                  <div>
                    <Label>CPEng number</Label>
                    <Input value={profileForm.cpeng_number} onChange={e => setP('cpeng_number', e.target.value)} placeholder="e.g. CPEng 987654" />
                    <p className="text-xs text-gray-400 mt-1">Chartered Professional Engineer</p>
                  </div>
                </div>
                <div className="mt-4">
                  <Label>Territorial authority (default council)</Label>
                  <Select
                    value={profileForm.council}
                    onChange={e => setP('council', e.target.value)}
                    options={[
                      { value: 'auckland', label: 'Auckland Council' },
                      { value: 'wellington', label: 'Wellington City Council' },
                      { value: 'christchurch', label: 'Christchurch City Council' },
                      { value: 'hamilton', label: 'Hamilton City Council' },
                      { value: 'tauranga', label: 'Tauranga City Council' },
                      { value: 'dunedin', label: 'Dunedin City Council' },
                      { value: 'palmerston-north', label: 'Palmerston North City Council' },
                      { value: 'napier', label: 'Napier City Council' },
                      { value: 'nelson', label: 'Nelson City Council' },
                      { value: 'rotorua', label: 'Rotorua District Council' },
                      { value: 'other', label: 'Other / Not listed' },
                    ]}
                  />
                  <p className="text-xs text-gray-400 mt-1">Appears in the footer of compliance documents</p>
                </div>
              </div>

              {/* Signature */}
              <div className="pt-3 border-t border-gray-100">
                <Label>Signature</Label>
                <p className="text-xs text-gray-400 mb-2">Applied automatically to compliance documents (PDF)</p>
                {signatureB64 ? (
                  <div className="flex items-start gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signatureB64.startsWith('data:') ? signatureB64 : `data:image/png;base64,${signatureB64}`}
                      alt="Your signature"
                      className="h-16 max-w-[220px] object-contain border border-gray-200 rounded-lg bg-white p-1"
                    />
                    <div className="flex flex-col gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setSigModalOpen(true)}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                      >
                        <PenLine className="h-3.5 w-3.5" /> Re-draw
                      </button>
                      <button
                        type="button"
                        onClick={clearSignature}
                        className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSigModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
                  >
                    <PenLine className="h-4 w-4" />
                    Add signature
                  </button>
                )}
              </div>

              <Button type="submit" loading={loading}>Save profile</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Signature capture modal */}
      <SignatureCaptureModal
        open={sigModalOpen}
        onClose={() => setSigModalOpen(false)}
        onSave={(b64) => { setSignatureB64(b64); setSigModalOpen(false) }}
      />

      {tab === 'integrations' && (
        <div className="space-y-6 max-w-2xl">
          {/* Google Calendar */}
          <Card>
            <CardHeader><CardTitle>Google Calendar</CardTitle></CardHeader>
            <CardContent>
              {googleConnected ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-700">&#10003; Connected</p>
                    <p className="text-xs text-gray-400 mt-0.5">Upcoming visits are synced to your Google Calendar</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" loading={googleSyncing} onClick={syncGoogleCalendar}>Sync now</Button>
                    <Button size="sm" variant="outline" loading={googleDisconnecting} onClick={disconnectGoogleCalendar}>Disconnect</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700">Connect Google Calendar to sync job visits automatically</p>
                    <p className="text-xs text-gray-400 mt-0.5">Syncs upcoming visits (next 60 days) to your personal calendar</p>
                  </div>
                  <a href="/api/google/auth" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#4285F4] text-white rounded-lg hover:bg-[#3367d6] transition-colors">Connect Google Calendar</a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Xero */}
          <Card>
            <CardHeader><CardTitle>Xero accounting</CardTitle></CardHeader>
            <CardContent>
              {company.xero_tenant_id ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-700">✓ Connected to Xero</p>
                    <p className="text-xs text-gray-400 mt-0.5">Sync invoices from the invoice detail page</p>
                  </div>
                  <a href="/api/xero/auth" className="text-xs text-orange-500 hover:underline">Reconnect</a>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700">Connect your Xero account to sync invoices automatically</p>
                    <p className="text-xs text-gray-400 mt-0.5">Requires XERO_CLIENT_ID + XERO_CLIENT_SECRET</p>
                  </div>
                  <a href="/api/xero/auth" className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#13B5EA] text-white rounded-lg hover:bg-[#0fa0d5] transition-colors">Connect Xero</a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Import */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-orange-500" />Import data</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 mb-4">Switching from another program? Import your customers, jobs, invoices, and price list in minutes — we support Tradify, ServiceM8, Fergus, Simpro, AroFlo, MYOB, and any CSV export.</p>
              <Link href="/settings/import">
                <Button variant="outline" size="sm">Open import wizard →</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'billing' && (
        <div className="space-y-6 max-w-2xl">
          <BillingTab company={company} />
        </div>
      )}

      {tab === 'team' && (
        <div className="space-y-4 max-w-4xl">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setInviteOpen(true)}>+ Add team member</Button>
          </div>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Role</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Bill rate</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Cost rate</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {team.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{m.full_name}</td>
                    <td className="px-6 py-3 text-gray-500">{m.email}</td>
                    <td className="px-6 py-3 capitalize"><Badge>{m.role}</Badge></td>
                    <td className="px-6 py-3 text-right text-gray-600">{m.hourly_bill_rate ? `$${m.hourly_bill_rate}/hr` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-6 py-3 text-right text-gray-600">{m.hourly_cost_rate ? `$${m.hourly_cost_rate}/hr` : <span className="text-gray-300">—</span>}</td>
                    <td className="px-6 py-3">{m.is_active ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Inactive</span>}</td>
                    <td className="px-3 py-3">
                      <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Add team member dialog */}
          <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Add team member">
            <form onSubmit={inviteTeamMember} className="space-y-4">
              <div><Label>Full name <span className="text-red-400">*</span></Label><Input value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} required /></div>
              <div><Label>Email <span className="text-red-400">*</span></Label><Input type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} required /></div>
              <div><Label>Role</Label>
                <Select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))} options={[
                  { value: 'staff', label: 'Staff' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'owner', label: 'Owner' },
                ]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bill rate ($/hr)</Label>
                  <Input type="number" step="0.01" value={inviteForm.hourly_bill_rate} onChange={e => setInviteForm(f => ({ ...f, hourly_bill_rate: e.target.value }))} placeholder="e.g. 95.00" />
                </div>
                <div>
                  <Label>Cost rate ($/hr)</Label>
                  <Input type="number" step="0.01" value={inviteForm.hourly_cost_rate} onChange={e => setInviteForm(f => ({ ...f, hourly_cost_rate: e.target.value }))} placeholder="e.g. 45.00" />
                </div>
              </div>
              <p className="text-xs text-gray-400">A temporary password will be generated. Share it with the team member so they can log in and change it.</p>
              <div className="flex gap-3"><Button type="submit" loading={loading}>Add member</Button><Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button></div>
            </form>
          </Dialog>

          {/* Edit team member dialog */}
          <Dialog open={!!editMember} onClose={() => setEditMember(null)} title={`Edit — ${editMember?.full_name}`}>
            <form onSubmit={saveEditMember} className="space-y-4">
              <div><Label>Role</Label>
                <Select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} options={[
                  { value: 'staff', label: 'Staff' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'owner', label: 'Owner' },
                ]} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bill rate ($/hr)</Label>
                  <Input type="number" step="0.01" value={editForm.hourly_bill_rate} onChange={e => setEditForm(f => ({ ...f, hourly_bill_rate: e.target.value }))} placeholder="e.g. 95.00" />
                  <p className="text-xs text-gray-400 mt-1">Used on timesheets &amp; invoices</p>
                </div>
                <div>
                  <Label>Cost rate ($/hr)</Label>
                  <Input type="number" step="0.01" value={editForm.hourly_cost_rate} onChange={e => setEditForm(f => ({ ...f, hourly_cost_rate: e.target.value }))} placeholder="e.g. 45.00" />
                  <p className="text-xs text-gray-400 mt-1">Used for job profitability</p>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded" />
                  <span className="text-sm text-gray-700">Active (can log in and appear in assignments)</span>
                </label>
              </div>
              <div className="flex gap-3"><Button type="submit" loading={loading}>Save changes</Button><Button type="button" variant="outline" onClick={() => setEditMember(null)}>Cancel</Button></div>
            </form>
          </Dialog>
        </div>
      )}
    </div>
  )
}

// ── Signature capture modal ───────────────────────────────────────────────────
function SignatureCaptureModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (base64: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasStrokes, setHasStrokes] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Callback ref: the canvas mounts fresh each time the Dialog opens, so reset the
  // stroke flag there (fires on mount/unmount, not during render).
  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node
    if (node) setHasStrokes(false)
  }, [])

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top }
  }, [])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasStrokes(false)
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    setDrawing(true)
    setHasStrokes(true)
    lastPos.current = getPos(e, canvas)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    e.preventDefault()
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }
    lastPos.current = pos
  }

  function endDraw() {
    setDrawing(false)
    lastPos.current = null
  }

  function save() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    onSave(dataUrl)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Draw your signature">
      <p className="text-sm text-gray-500 mb-4">Sign using your mouse or finger in the box below.</p>
      <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white" style={{ touchAction: 'none' }}>
        <canvas
          ref={setCanvasRef}
          width={460}
          height={160}
          className="w-full cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          style={{ display: 'block' }}
        />
      </div>
      <div className="flex gap-3 mt-4">
        <Button onClick={save} disabled={!hasStrokes}>Save signature</Button>
        <Button variant="outline" type="button" onClick={clearCanvas}>Clear</Button>
        <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
      </div>
    </Dialog>
  )
}

const PLANS = [
  { key: 'solo', label: 'Solo', price: '$29/mo', desc: '1 user, unlimited jobs & quotes' },
  { key: 'team', label: 'Team', price: '$79/mo', desc: 'Up to 10 users, all features' },
  { key: 'pro', label: 'Pro', price: '$149/mo', desc: 'Unlimited users + priority support' },
]

function BillingTab({ company }: { company: Company }) {
  const [loading, setLoading] = useState<string>('')
  const { toast } = useToast()

  // Snapshot "now" once so the render stays pure (no Date.now() during render).
  const [nowMs] = useState(() => Date.now())
  const trialDaysLeft = company.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at).getTime() - nowMs) / 86400000))
    : null

  async function subscribe(plan: string) {
    setLoading(plan)
    const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) })
    const data = await res.json()
    if (!res.ok) { toast(data.error ?? 'Failed to start checkout', 'error'); setLoading(''); return }
    window.location.href = data.url
  }

  async function openPortal() {
    setLoading('portal')
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { toast(data.error ?? 'Failed to open billing portal', 'error'); setLoading(''); return }
    window.location.href = data.url
  }

  const isActive = company.subscription_plan !== 'trial'

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader><CardTitle>Current plan</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-900 capitalize">{company.subscription_plan} plan</p>
              <p className="text-sm text-gray-500 capitalize">Status: {company.subscription_status}</p>
              {trialDaysLeft !== null && trialDaysLeft > 0 && (
                <p className="text-sm text-orange-600 font-medium mt-1">{trialDaysLeft} days left in trial</p>
              )}
              {trialDaysLeft === 0 && company.subscription_plan === 'trial' && (
                <p className="text-sm text-red-600 font-medium mt-1">Trial expired — subscribe to continue</p>
              )}
            </div>
            {isActive && (
              <Button variant="outline" size="sm" loading={loading === 'portal'} onClick={openPortal}>Manage billing</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!isActive && (
        <div className="grid gap-4">
          <p className="text-sm font-medium text-gray-700">Choose a plan to get started</p>
          {PLANS.map(plan => (
            <Card key={plan.key} className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold text-gray-900">{plan.label} <span className="text-orange-500">{plan.price}</span></p>
                <p className="text-sm text-gray-500">{plan.desc}</p>
              </div>
              <Button size="sm" loading={loading === plan.key} onClick={() => subscribe(plan.key)}>Subscribe</Button>
            </Card>
          ))}
        </div>
      )}

    </div>
  )
}
