'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { BillingRatesManager, PaymentMethodsManager, TaxRatesManager, EnquiryInboxManager, JobStatusesManager } from '@/components/forms/company-lists'
import { Upload, Pencil, X, ArrowRightLeft, PenLine, Trash2, Check, Archive } from 'lucide-react'
import { getPlan, planForSeats } from '@/lib/plans'
import { extractAccent } from '@/lib/extract-color'
import { MfaSection } from '@/components/settings/mfa-section'
import { TIMEZONES } from '@/lib/datetime'

interface Props {
  profile: Profile & { companies: Company }
  company: Company
  team: Profile[]
  googleConnected: boolean
}

export function SettingsClient({ profile, company, team: initialTeam, googleConnected: initialGoogleConnected }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const mfaRequired = searchParams.get('mfa_required') === '1'
  const requestedTab = searchParams.get('tab')
  const initialTab = requestedTab && ['business', 'workflow', 'team', 'profile', 'integrations', 'subscription', 'developer'].includes(requestedTab)
    ? requestedTab as 'business' | 'workflow' | 'team' | 'profile' | 'integrations' | 'subscription' | 'developer'
    : 'business'
  const { toast } = useToast()
  const [tab, setTab] = useState<'business' | 'workflow' | 'team' | 'profile' | 'integrations' | 'subscription' | 'developer'>(mfaRequired ? 'profile' : initialTab)
  const [testMode, setTestMode] = useState<boolean>(!!(company as Company & { test_mode?: boolean }).test_mode)
  const [testToggling, setTestToggling] = useState(false)
  const [loading, setLoading] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editMember, setEditMember] = useState<Profile | null>(null)
  const [team, setTeam] = useState<Profile[]>(initialTeam)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logo_url ?? null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [themeAccent, setThemeAccent] = useState<string | null>(company.theme_accent ?? null)
  const [suggestedAccent, setSuggestedAccent] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState(initialGoogleConnected)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false)

  const SYSTEM_DEFAULT_STAGES = ['Planning & design', 'Materials & ordering', 'Site prep', 'Construction', 'Finishing & sign-off']
  const [projectStages, setProjectStages] = useState<string[]>(company.default_project_stages ?? SYSTEM_DEFAULT_STAGES)
  const [autoAddStages, setAutoAddStages] = useState(true)
  const [newStage, setNewStage] = useState('')
  const [savingStages, setSavingStages] = useState(false)

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
    default_job_assignee_id: company.default_job_assignee_id ?? '',
    review_link: company.review_link ?? '',
    review_request_enabled: company.review_request_enabled ?? true,
    standard_markup_enabled: (company as Company & { standard_markup_enabled?: boolean }).standard_markup_enabled ?? false,
    standard_markup_pct: ((company as Company & { standard_markup_pct?: number }).standard_markup_pct ?? 80).toString(),
  })

  const [profileForm, setProfileForm] = useState({
    full_name: profile.full_name ?? '',
    phone: profile.phone ?? '',
    hourly_bill_rate: profile.hourly_bill_rate?.toString() ?? '',
    hourly_cost_rate: profile.hourly_cost_rate?.toString() ?? '',
    lbp_number: (profile as unknown as Record<string, unknown>).lbp_number as string ?? '',
    cpeng_number: (profile as unknown as Record<string, unknown>).cpeng_number as string ?? '',
    council: ((profile as unknown as Record<string, unknown>).council as string) ?? 'auckland',
    timezone: ((profile as unknown as Record<string, unknown>).timezone as string) ?? 'Pacific/Auckland',
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
    role: 'staff', hourly_bill_rate: '', hourly_cost_rate: '', is_active: true, vehicle_registration: '', job_title: '',
  })
  const activeTeam = team.filter(member => member.is_active !== false)

  function setC(k: string, v: string) { setCompanyForm(f => ({ ...f, [k]: v })) }
  function setP(k: keyof typeof profileForm, v: string) { setProfileForm(f => ({ ...f, [k]: v })) }

  async function uploadLogo(file: File) {
    setLogoUploading(true)
    // Sample the logo for a dominant accent — only offered as a suggestion;
    // owner clicks "Use" to actually apply.
    extractAccent(file).then(c => { if (c) setSuggestedAccent(c) }).catch(() => {})
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

  async function saveAccent(hex: string | null) {
    const { error } = await supabase.from('companies').update({ theme_accent: hex }).eq('id', company.id)
    if (error) { toast(error.message, 'error'); return }
    setThemeAccent(hex)
    setSuggestedAccent(null)
    toast(hex ? 'Theme accent updated' : 'Theme accent reset')
    router.refresh()
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
      standard_markup_enabled: companyForm.standard_markup_enabled,
      standard_markup_pct: parseFloat(companyForm.standard_markup_pct) || 0,
      default_job_assignee_id: companyForm.default_job_assignee_id || null,
    }).eq('id', company.id)
    if (error) toast(error.message, 'error')
    else { toast('Company settings saved'); router.refresh() }
    setLoading(false)
  }

  async function saveProjectStages() {
    setSavingStages(true)
    const value = autoAddStages ? (projectStages.length > 0 ? projectStages : []) : []
    const { error } = await supabase.from('companies').update({ default_project_stages: value }).eq('id', company.id)
    setSavingStages(false)
    if (error) toast(error.message, 'error')
    else toast('Default stages saved')
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
      timezone: profileForm.timezone || 'Pacific/Auckland',
      signature_base64: signatureB64 || null,
    } as Record<string, unknown>).eq('id', profile.id)
    if (error) toast(error.message, 'error')
    else { toast('Profile saved'); router.refresh() }
    setLoading(false)
  }

  async function clearSignature() {
    setSignatureB64(null)
  }

  async function performInvite() {
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
    const { data: newProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', inviteForm.email)
      .eq('company_id', company.id)
      .single()
    if (newProfile) setTeam(prev => [...prev, newProfile as Profile])
    setLoading(false)
  }

  async function inviteTeamMember(e: React.FormEvent) {
    e.preventDefault()
    // Plan-cap check. Trial/Solo/Team have hard seat caps — bumping into one
    // requires confirming a plan upgrade BEFORE we create the auth user.
    const exempt = (company as Company & { billing_exempt?: boolean }).billing_exempt === true
    const currentPlan = getPlan((company as Company & { subscription_plan?: string }).subscription_plan)
    const activeCount = team.filter(t => t.is_active !== false).length
    const upgrade = exempt ? null : planForSeats(currentPlan, activeCount + 1)
    if (upgrade) {
      const ok = window.confirm(
        `You're on ${currentPlan.label}. Adding ${inviteForm.full_name || 'this member'} will take you over the limit and upgrade you to ${upgrade.label} at $${upgrade.monthly}/mo (NZD).\n\nContinue?`
      )
      if (!ok) return
      setLoading(true)
      const up = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: upgrade.key }),
      })
      const upData = await up.json()
      if (!up.ok) { toast(upData.error ?? 'Could not upgrade plan', 'error'); setLoading(false); return }
      toast(`Upgraded to ${upgrade.label}`)
    }
    await performInvite()
  }

  function openEdit(member: Profile) {
    setEditMember(member)
    setEditForm({
      role: member.role ?? 'staff',
      vehicle_registration: (member as unknown as { vehicle_registration?: string }).vehicle_registration ?? '',
      job_title: (member as unknown as { job_title?: string }).job_title ?? '',
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
      vehicle_registration: editForm.vehicle_registration || null,
      job_title: editForm.job_title || null,
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

  async function archiveTeamMember(member: Profile) {
    if (member.id === profile.id) {
      toast('You cannot archive your own account', 'error')
      return
    }
    if (!confirm(`Archive ${member.full_name}? They will no longer appear in assignments or count as active.`)) return
    setLoading(true)
    const res = await fetch('/api/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table: 'profiles', id: member.id }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { toast(data.error ?? 'Could not archive staff member', 'error'); return }
    setTeam(prev => prev.map(m => m.id === member.id ? { ...m, is_active: false } : m))
    toast('Staff member archived')
  }

  const planLabel: Record<string, string> = { trial: 'Trial', solo: 'Solo (1 user)', team: 'Team (up to 10)', pro: 'Pro (unlimited)' }

  return (
    <div className="p-6">
      {/* Friendly grouped tab bar. Each tab owns one focused topic so a new
          user can fumble through without prior context. */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-lg p-1 mb-2 w-fit">
        {([
          { key: 'business',     label: 'Business' },
          { key: 'workflow',     label: 'Workflow' },
          { key: 'team',         label: 'Team' },
          { key: 'profile',      label: 'My profile' },
          { key: 'integrations', label: 'Integrations' },
          { key: 'subscription', label: 'Subscription' },
          { key: 'developer',    label: 'Test Mode' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mb-6">
        {tab === 'business'     && 'Your business name, logo, branding and document defaults.'}
        {tab === 'workflow'     && 'Customise the lists and rates that drive jobs, quotes and invoices.'}
        {tab === 'team'         && 'Invite people, set their rate, and control what they can see.'}
        {tab === 'profile'      && 'Your personal details, signature and trade qualifications.'}
        {tab === 'integrations' && 'Connect external services — accounting, calendar and data import.'}
        {tab === 'developer'    && 'Load demo data to explore the system without touching real records.'}
        {tab === 'subscription' && 'Your plan, billing history and seat usage.'}
      </p>

      {tab === 'business' && (
        <Card className="max-w-2xl">
          <CardHeader><CardTitle>Business settings</CardTitle></CardHeader>
          <CardContent>
            {/* Plan summary — full management lives under the Subscription tab */}
            <div className="flex items-center justify-between gap-3 mb-6 p-3 bg-[var(--accent,#f97316)]/10 rounded-lg border border-[var(--accent,#f97316)]/20">
              <div>
                <p className="text-sm font-medium text-[var(--accent,#f97316)]">Current plan: <strong>{planLabel[company.subscription_plan] ?? company.subscription_plan}</strong></p>
                <p className="text-xs text-[var(--accent,#f97316)]">Status: {company.subscription_status}</p>
              </div>
              <button type="button" onClick={() => setTab('subscription')} className="text-xs font-medium text-[var(--accent,#f97316)] hover:underline">Manage →</button>
            </div>
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Starting tutorial</p>
                <p className="text-xs text-gray-500 mt-0.5">Replay the welcome walkthrough and feature overview.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.dispatchEvent(new Event('industryforms:replay-welcome-tutorial'))}
              >
                Replay tutorial
              </Button>
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

            <div>
              <Label>Theme accent</Label>
              <p className="text-xs text-gray-400 mb-2">Drives the &ldquo;+ New&rdquo; button and any unscoped pages. Suggested from your logo.</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg pl-1 pr-3 py-1">
                  <input
                    type="color"
                    value={themeAccent ?? '#f97316'}
                    onChange={e => setThemeAccent(e.target.value)}
                    className="h-7 w-9 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-xs font-mono text-gray-600">{themeAccent ?? '#f97316'}</span>
                </div>
                <Button size="sm" type="button" onClick={() => saveAccent(themeAccent)}>Save accent</Button>
                {themeAccent && (
                  <button type="button" onClick={() => saveAccent(null)} className="text-xs text-gray-500 hover:underline">Reset to default</button>
                )}
                {suggestedAccent && suggestedAccent.toLowerCase() !== (themeAccent ?? '').toLowerCase() && (
                  <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200">
                    <span className="text-xs text-gray-500">From logo:</span>
                    <span className="h-5 w-5 rounded border border-gray-200" style={{ backgroundColor: suggestedAccent }} />
                    <span className="text-xs font-mono text-gray-600">{suggestedAccent}</span>
                    <button type="button" onClick={() => saveAccent(suggestedAccent)} className="text-xs font-medium text-[var(--accent,#f97316)] hover:underline inline-flex items-center gap-1">
                      <Check className="h-3 w-3" /> Use this
                    </button>
                  </div>
                )}
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
              <div>
                <Label>Review link <span className="text-xs font-normal text-gray-400 ml-1">(optional)</span></Label>
                <Input type="url" placeholder="https://g.page/r/…" value={companyForm.review_link}
                  onChange={e => setC('review_link', e.target.value)} />
                <label className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                  <input type="checkbox" checked={companyForm.review_request_enabled}
                    onChange={e => setCompanyForm(f => ({ ...f, review_request_enabled: e.target.checked }))}
                    className="rounded border-gray-300" />
                  Email customers a one-tap review link after they pay their invoice
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={companyForm.prices_include_tax} onChange={e => setCompanyForm(f => ({ ...f, prices_include_tax: e.target.checked }))} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                Prices include GST (tax-inclusive entry on quotes &amp; invoices)
              </label>
              <div className="rounded-xl border border-gray-200 p-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={companyForm.standard_markup_enabled} onChange={e => setCompanyForm(f => ({ ...f, standard_markup_enabled: e.target.checked }))} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                  Use standard markup when an item has cost only
                </label>
                <div className="max-w-xs">
                  <Label>Standard markup (%)</Label>
                  <Input type="number" min="0" step="0.01" value={companyForm.standard_markup_pct} onChange={e => setC('standard_markup_pct', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Default job assignee</Label>
                <Select
                  value={companyForm.default_job_assignee_id}
                  onChange={e => setC('default_job_assignee_id', e.target.value)}
                  options={[
                    { value: '', label: 'No default' },
                    ...activeTeam.map(member => ({
                      value: member.id,
                      label: member.full_name || member.email,
                    })),
                  ]}
                />
                <p className="text-xs text-gray-400 mt-1">Pre-selected when creating a job. You can still choose someone else on the job.</p>
              </div>
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
          </CardContent>
        </Card>
      )}

      {tab === 'workflow' && (
        <div className="max-w-4xl space-y-6">
          <Card>
            <CardHeader><CardTitle>Job statuses</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">The columns on the Jobs board and the dropdown on each job.</p>
              <JobStatusesManager companyId={company.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Tax rates</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">GST, exempt, or any custom rate. Picked per line on quotes &amp; invoices.</p>
              <TaxRatesManager companyId={company.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Hourly rates</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">Saved hourly rates you can pick on timesheets &amp; quote lines (e.g. &ldquo;Standard&rdquo;, &ldquo;After-hours&rdquo;). Not your subscription plan — that&apos;s on the Subscription tab.</p>
              <BillingRatesManager companyId={company.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Payment methods</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">Methods that appear when recording a payment (cash, bank transfer, EFTPOS).</p>
              <PaymentMethodsManager companyId={company.id} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Enquiry inbox email</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">Forward customer enquiries to this address — they land as enquiries automatically.</p>
              <EnquiryInboxManager companyId={company.id} initialToken={(company as Company & { inbound_email_token?: string | null }).inbound_email_token ?? null} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Default project stages</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500 mb-4">These stages are automatically added whenever a new project is created. Drag to reorder is not yet supported — delete and re-add to change order.</p>
              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input type="checkbox" checked={autoAddStages} onChange={e => setAutoAddStages(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-700">Auto-add stages to new projects</span>
              </label>
              {autoAddStages && (
                <div className="space-y-3">
                  <ul className="space-y-2">
                    {projectStages.map((name, i) => (
                      <li key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                        <span className="flex-1 text-sm text-gray-800">{name}</span>
                        <button type="button" onClick={() => setProjectStages(s => s.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-400">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newStage}
                      onChange={e => setNewStage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newStage.trim()) { setProjectStages(s => [...s, newStage.trim()]); setNewStage('') } }}
                      placeholder="Add a stage name…"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent,#f97316)]"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => { if (newStage.trim()) { setProjectStages(s => [...s, newStage.trim()]); setNewStage('') } }}>
                      Add
                    </Button>
                  </div>
                </div>
              )}
              <div className="mt-4">
                <Button onClick={saveProjectStages} loading={savingStages} size="sm">Save stages</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'profile' && (
        <Card className="max-w-xl">
          <CardHeader><CardTitle>My profile</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div><Label>Full name <span className="text-red-400">*</span></Label><Input value={profileForm.full_name} onChange={e => setP('full_name', e.target.value)} required /></div>
              <div><Label>Phone</Label><Input value={profileForm.phone} onChange={e => setP('phone', e.target.value)} /></div>
              <div>
                <Label>Timezone</Label>
                <Select
                  value={profileForm.timezone}
                  onChange={e => setP('timezone', e.target.value)}
                  options={TIMEZONES.map(tz => ({ value: tz.value, label: tz.label }))}
                />
                <p className="text-xs text-gray-400 mt-1">Used for dates &amp; times across web and mobile, on this account</p>
              </div>
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

      {tab === 'profile' && (
        <div className="max-w-xl mt-6 space-y-4">
          {mfaRequired && (
            <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">
              Admin access requires two-factor authentication. Enable it below to continue.
            </p>
          )}
          <MfaSection />
        </div>
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

      {tab === 'subscription' && (
        <div className="space-y-6 max-w-7xl">
          <BillingTab company={company} />
        </div>
      )}

      {tab === 'developer' && (
        <div className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader><CardTitle>Test mode</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-600">
                Populate your account with realistic demo data — customers, jobs, invoices, purchase orders, bills, suppliers, travel logs and projects — so you can explore the system without touching real records. A caution-tape banner appears while test mode is active as a reminder. Disabling test mode deletes all seeded records.
              </p>
              <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Test mode is {testMode ? 'on' : 'off'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{testMode ? 'Demo data is loaded. Disable to delete all test records.' : 'Enable to load sample data across all modules.'}</p>
                </div>
                <button
                  disabled={testToggling}
                  onClick={async () => {
                    setTestToggling(true)
                    const res = await fetch('/api/test-mode', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: testMode ? 'disable' : 'enable' }),
                    })
                    if (res.ok) {
                      setTestMode(v => !v)
                      toast(testMode ? 'Test data cleared' : 'Test data loaded', 'success')
                      router.refresh()
                    } else {
                      toast('Failed to toggle test mode', 'error')
                    }
                    setTestToggling(false)
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${testMode ? 'bg-amber-500' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${testMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              {testMode && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Test mode is active. All data shown in the app may include demo records. Disable above to clean up.
                </p>
              )}
            </CardContent>
          </Card>
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
                      <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-gray-600 p-1 rounded" title="Edit staff member">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {m.is_active && (
                        <button onClick={() => archiveTeamMember(m)} className="text-gray-400 hover:text-amber-600 p-1 rounded" title="Archive staff member">
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                      </div>
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
                <Label>Job title</Label>
                <Input value={editForm.job_title} onChange={e => setEditForm(f => ({ ...f, job_title: e.target.value }))} placeholder="e.g. Project Manager, Site Manager" />
              </div>
              <div>
                <Label>Vehicle registration</Label>
                <Input value={editForm.vehicle_registration} onChange={e => setEditForm(f => ({ ...f, vehicle_registration: e.target.value }))} placeholder="e.g. ABC123" />
                <p className="text-xs text-gray-400 mt-1">Used in the vehicle logbook report</p>
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

// Compact configured/not-configured indicator for the Integrations cards.
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

const PLAN_DETAILS = [
  {
    key: 'trial',
    label: 'Free trial',
    price: 'Free',
    users: '1 user',
    desc: '30-day free trial with full access',
    features: ['All core features', 'Jobs, quotes & invoices', 'Customer management', 'Mobile app access'],
    highlight: false,
  },
  {
    key: 'solo',
    label: 'Solo',
    price: '$29/mo',
    origPrice: '$49',
    intro: 'Intro price, locked in for 2026',
    users: '1 user',
    desc: 'Perfect for sole traders',
    features: ['All core features', 'Unlimited jobs & quotes', 'Invoice payments', 'Customer portal', 'Price list & materials', 'Email included; SMS add-on'],
    highlight: false,
  },
  {
    key: 'team',
    label: 'Team',
    price: '$49/mo',
    origPrice: '$79',
    intro: 'Intro price, locked in for 2026',
    users: 'Up to 10 users',
    desc: 'Grow your crew',
    features: ['Everything in Solo', 'Team scheduling & GPS map', 'Role-based access', 'Timesheets & travel logs', 'Supplier/PO/Bills module', 'Projects add-on ($19/mo)', 'Instant website ($19/mo)'],
    highlight: true,
  },
  {
    key: 'pro',
    label: 'Pro',
    price: '$99/mo',
    origPrice: '$149',
    intro: 'Intro price, locked in for 2026',
    users: 'Unlimited users',
    desc: 'For larger operations',
    features: ['Everything in Team', 'Unlimited team members', 'Priority support', 'Advanced reporting', 'Bulk invoicing', 'Xero & accounting sync'],
    highlight: false,
  },
]

function BillingTab({ company }: { company: Company }) {
  const [loading, setLoading] = useState<string>('')
  const [smsLoading, setSmsLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  const [nowMs] = useState(() => Date.now())
  const trialDaysLeft = company.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(company.trial_ends_at).getTime() - nowMs) / 86400000))
    : null

  const currentPlan = company.subscription_plan ?? 'trial'
  const companyAddons = ((company as Company & { addons?: Record<string, { active?: boolean }> }).addons ?? {})
  const isExempt = (company as Company & { billing_exempt?: boolean }).billing_exempt === true
  const initialSmsEnabled = isExempt || companyAddons.sms_usage?.active === true
  const [smsEnabled, setSmsEnabled] = useState(initialSmsEnabled)

  async function subscribe(plan: string) {
    setLoading(plan)
    const res = await fetch('/api/stripe/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) })
    const data = await res.json()
    if (!res.ok) { toast(data.error ?? 'Failed to start checkout', 'error'); setLoading(''); return }
    window.location.assign(data.url)
  }

  async function openPortal() {
    setLoading('portal')
    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      // No Stripe customer yet — the company has never completed a paid checkout
      // (trial / test-mode / exempt). Point them at the plan cards below instead
      // of the opaque "No billing account found".
      const msg = data.error === 'No billing account found'
        ? 'No paid subscription yet — choose a plan below to set up billing.'
        : (data.error ?? 'Failed to open billing portal')
      toast(msg, 'error')
      setLoading('')
      return
    }
    window.location.assign(data.url)
  }

  async function toggleSmsBilling(next: boolean) {
    setSmsLoading(true)
    const res = await fetch('/api/billing/addon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'sms_usage', active: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast(data.error ?? 'Failed to update SMS billing', 'error')
      setSmsLoading(false)
      return
    }
    if (data.url) {
      window.location.assign(data.url)
      return
    }
    setSmsEnabled(next)
    setSmsLoading(false)
    toast(next ? 'SMS billing enabled' : 'SMS billing disabled')
    router.refresh()
  }

  // bookings_website / projects add-ons: enabling opens Stripe Checkout (card +
  // recurring charge on the next bill); disabling opens the billing portal.
  const [addonLoading, setAddonLoading] = useState<string>('')
  async function toggleAddon(slug: 'bookings_website' | 'projects', next: boolean) {
    setAddonLoading(slug)
    const res = await fetch('/api/billing/addon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, active: next }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast(data.error ?? 'Failed to update add-on', 'error'); setAddonLoading(''); return }
    if (data.url) { window.location.assign(data.url); return }
    setAddonLoading('')
    toast(next ? 'Add-on enabled' : 'Add-on cancelled')
    router.refresh()
  }

  const PLAN_ORDER = ['trial', 'solo', 'team', 'pro']
  const currentIdx = PLAN_ORDER.indexOf(currentPlan)

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">
                Current plan: <span className="text-[var(--accent,#f97316)] capitalize">{currentPlan === 'trial' ? 'Free trial' : currentPlan}</span>
              </p>
              <p className="text-sm text-gray-500 capitalize mt-0.5">
                Status: {company.subscription_status ?? 'trialing'}
                {trialDaysLeft !== null && trialDaysLeft > 0 && ` · ${trialDaysLeft} days left`}
              </p>
              {trialDaysLeft === 0 && currentPlan === 'trial' && (
                <p className="text-sm text-red-600 font-medium mt-1">Trial expired — choose a plan below to continue</p>
              )}
            </div>
            {currentPlan !== 'trial' && (
              <Button
                size="sm"
                loading={loading === 'portal'}
                onClick={openPortal}
                className="bg-green-600 text-white hover:bg-green-700 border-transparent"
              >
                Manage billing
              </Button>
            )}
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm text-gray-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-[var(--accent,#f97316)] focus:ring-[var(--accent,#f97316)]"
              checked={smsEnabled}
              disabled={smsLoading}
              onChange={(event) => toggleSmsBilling(event.target.checked)}
            />
            <span>
              <span className="font-medium text-gray-900">Enable SMS (Quote, booking, late payments follow ups) - 13c per message</span>
              <span className="block text-xs text-gray-500 mt-0.5">Billed monthly through Stripe from the outbound SMS usage ledger.</span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Paid add-ons */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <p className="text-base font-semibold text-gray-900">Add-ons</p>
          {([
            { slug: 'bookings_website' as const, name: 'Instant Bookings Website', price: '$19/mo', blurb: 'Build and preview your site free — a subscription is required to publish it and take online bookings.' },
            { slug: 'projects' as const, name: 'Projects', price: '$19/mo', blurb: 'Multi-stage project management with progress tracking and money rollups.' },
          ]).map(a => {
            const active = isExempt || companyAddons[a.slug]?.active === true
            return (
              <div key={a.slug} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.name} <span className="text-gray-400">· {a.price}</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{a.blurb}</p>
                </div>
                {active ? (
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-medium text-green-600">Active</span>
                    {!isExempt && (
                      <Button variant="outline" size="sm" loading={addonLoading === a.slug} onClick={() => toggleAddon(a.slug, false)}>Manage</Button>
                    )}
                  </span>
                ) : (
                  <Button size="sm" className="shrink-0" loading={addonLoading === a.slug} onClick={() => toggleAddon(a.slug, true)}>Add</Button>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Plan grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-5">
        {PLAN_DETAILS.map((plan) => {
          const isCurrent = plan.key === currentPlan
          const isUpgrade = PLAN_ORDER.indexOf(plan.key) > currentIdx
          const isDowngrade = PLAN_ORDER.indexOf(plan.key) < currentIdx && plan.key !== 'trial'
          return (
            <div
              key={plan.key}
              className={`relative min-w-0 rounded-2xl border-2 p-5 flex flex-col transition-all ${
                isCurrent
                  ? 'border-[var(--accent,#f97316)] bg-orange-50'
                  : plan.highlight
                  ? 'border-blue-400 bg-blue-50/40'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-[var(--accent,#f97316)] text-white text-xs font-bold px-3 py-0.5 rounded-full whitespace-nowrap">Current plan</span>
                </div>
              )}
              {plan.highlight && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-3 py-0.5 rounded-full">Most popular</span>
                </div>
              )}
              <div className="mb-4">
                <p className="text-base font-bold text-gray-900">{plan.label}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  {plan.origPrice && <span className="text-base font-semibold text-gray-400 line-through">{plan.origPrice}</span>}
                  <span className="text-2xl font-bold text-[var(--accent,#f97316)]">{plan.price}</span>
                </p>
                {plan.intro && <p className="text-xs font-medium text-green-600 mt-0.5">{plan.intro}</p>}
                <p className="text-xs text-gray-500 mt-0.5">{plan.users}</p>
                <p className="text-xs text-gray-400 mt-1">{plan.desc}</p>
              </div>
              <ul className="space-y-1.5 flex-1 mb-5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                    <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="rounded-lg bg-[var(--accent,#f97316)]/10 text-[var(--accent,#f97316)] text-xs font-semibold text-center py-2">
                  Active
                </div>
              ) : plan.key === 'trial' ? null : (
                <Button
                  size="sm"
                  variant={isDowngrade ? 'outline' : 'default'}
                  loading={loading === plan.key}
                  onClick={() => subscribe(plan.key)}
                  className="w-full"
                >
                  {isUpgrade ? `Upgrade to ${plan.label}` : `Switch to ${plan.label}`}
                </Button>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">Prices in NZD. Upgrades and downgrades take effect immediately. Cancel any time from the billing portal.</p>
    </div>
  )
}
