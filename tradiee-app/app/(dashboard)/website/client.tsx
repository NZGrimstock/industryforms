'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  blankSection, slugify, SECTION_LABELS, WEBSITE_STYLES,
  type WebsiteSection, type WebsiteSectionType, type WebsiteTheme,
} from '@/lib/website'
import {
  Plus, Trash2, ChevronUp, ChevronDown, ExternalLink, Globe, Check, Loader2, RefreshCw, Pipette, Sparkles, Calendar, Upload, Ban, X,
} from 'lucide-react'
import { extractPalette, samplePixel } from '@/lib/extract-color'

type DnsRecord = { type: string; name: string; value: string; note: string }

type Initial = {
  slug: string
  isPublished: boolean
  theme: WebsiteTheme
  sections: WebsiteSection[]
  seoTitle: string
  seoDescription: string
  customDomain: string
  domainStatus: string
  bookingsEnabled: boolean
  siteMode: 'builder' | 'custom'
  customSiteStatus: string
  exists: boolean
}

const ALL_TYPES: WebsiteSectionType[] = ['hero', 'about', 'services', 'gallery', 'testimonials', 'contact', 'booking']
const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500'

export function WebsiteClient({
  companyId, appUrl, canPublish, photoUrls: initialPhotoUrls, initial, logoUrl: initialLogoUrl,
}: {
  companyId: string
  appUrl: string
  canPublish: boolean
  photoUrls: string[]
  initial: Initial
  logoUrl: string | null
}) {
  const supabase = createClient()
  const [photoUrls, setPhotoUrls] = useState(initialPhotoUrls)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl)
  const [slug, setSlug] = useState(initial.slug)
  const [theme, setTheme] = useState<WebsiteTheme>(initial.theme)
  const [sections, setSections] = useState<WebsiteSection[]>(initial.sections)
  const [seoTitle, setSeoTitle] = useState(initial.seoTitle)
  const [seoDescription, setSeoDescription] = useState(initial.seoDescription)
  const [isPublished, setIsPublished] = useState(initial.isPublished)
  const [customDomain, setCustomDomain] = useState(initial.customDomain)
  const [domainStatus, setDomainStatus] = useState(initial.domainStatus) // 'none' | 'pending' | 'active'
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([])
  const [domainBusy, setDomainBusy] = useState(false)
  const [domainMsg, setDomainMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [bookingsEnabled, setBookingsEnabled] = useState(initial.bookingsEnabled)
  const [siteMode, setSiteMode] = useState(initial.siteMode)
  const [customSiteStatus, setCustomSiteStatus] = useState(initial.customSiteStatus)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)

  function patchSection(idx: number, patch: Partial<WebsiteSection>) {
    setSections(prev => prev.map((s, i) => (i === idx ? ({ ...s, ...patch } as WebsiteSection) : s)))
  }
  function move(idx: number, dir: -1 | 1) {
    setSections(prev => {
      const next = [...prev]
      const j = idx + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  function remove(idx: number) {
    setSections(prev => prev.filter((_, i) => i !== idx))
  }
  function add(type: WebsiteSectionType) {
    setSections(prev => [...prev, blankSection(type)])
    setAddOpen(false)
  }

  // Hide a photo from the picker (doesn't delete the underlying job photo) —
  // also clears it from any section currently using it, and persists the
  // exclusion immediately so it stays hidden after a reload.
  async function excludePhoto(url: string) {
    setPhotoUrls(prev => prev.filter(u => u !== url))
    setSections(prev => prev.map(s => {
      const withImages = s as WebsiteSection & { imageUrl?: string; images?: string[] }
      const next = { ...s } as WebsiteSection & { imageUrl?: string; images?: string[] }
      if (withImages.imageUrl === url) next.imageUrl = undefined
      if (withImages.images?.includes(url)) next.images = withImages.images.filter(u => u !== url)
      return next
    }))
    const { data } = await supabase.from('company_websites').select('excluded_photo_urls').eq('company_id', companyId).maybeSingle()
    const existing: string[] = data?.excluded_photo_urls ?? []
    if (!existing.includes(url)) {
      await supabase.from('company_websites').update({ excluded_photo_urls: [...existing, url] }).eq('company_id', companyId)
    }
  }

  async function save(publishState = isPublished, bookingsState = bookingsEnabled) {
    setSaving(true)
    setMsg(null)
    const cleanSlug = slugify(slug)
    if (cleanSlug !== slug) setSlug(cleanSlug)
    const { error } = await supabase
      .from('company_websites')
      .upsert({
        company_id: companyId,
        slug: cleanSlug,
        theme,
        sections,
        seo_title: seoTitle || null,
        seo_description: seoDescription || null,
        custom_domain: customDomain || null,
        is_published: publishState,
        bookings_enabled: bookingsState,
      }, { onConflict: 'company_id' })
    setSaving(false)
    if (error) {
      setMsg({ kind: 'err', text: error.code === '23505' ? 'That web address is already taken — try another.' : error.message })
      return false
    }
    setMsg({ kind: 'ok', text: 'Saved.' })
    return true
  }

  async function togglePublish() {
    if (!isPublished && !canPublish) return // gated — handled by upgrade CTA
    const next = !isPublished
    const ok = await save(next)
    if (ok) setIsPublished(next)
  }

  async function toggleBookings() {
    if (!canPublish) return // gated by the same add-on
    const next = !bookingsEnabled
    const ok = await save(isPublished, next)
    if (ok) setBookingsEnabled(next)
  }

  async function uploadCustomSite(file: File) {
    if (!canPublish) return
    setUploading(true)
    setUploadMsg(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/site/custom/upload', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setUploadMsg(data.error ?? 'Upload failed'); return }
      setSiteMode('custom')
      setCustomSiteStatus('active')
      setUploadMsg('Uploaded — your custom site is live.')
    } catch {
      setUploadMsg('Network error')
    } finally {
      setUploading(false)
    }
  }

  async function switchToBuilder() {
    setSaving(true)
    const { error } = await supabase.from('company_websites').update({ site_mode: 'builder' }).eq('company_id', companyId)
    setSaving(false)
    if (!error) setSiteMode('builder')
  }

  async function domainCall(method: 'POST' | 'PUT' | 'DELETE') {
    setDomainBusy(true)
    setDomainMsg(null)
    try {
      const res = await fetch('/api/website/domain', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ domain: customDomain }) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setDomainMsg(data.error ?? 'Something went wrong'); return }
      setDomainStatus(data.status ?? 'none')
      if (data.dns) setDnsRecords(data.dns)
      if (method === 'DELETE') { setCustomDomain(''); setDnsRecords([]) }
      if (method === 'PUT') setDomainMsg(data.status === 'active' ? 'Verified — your domain is live.' : 'Not verified yet. DNS can take a while to propagate.')
    } catch {
      setDomainMsg('Network error')
    } finally {
      setDomainBusy(false)
    }
  }

  async function subscribe() {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'bookings_website' }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.url) window.location.href = data.url
    else setMsg({ kind: 'err', text: data.error ?? 'Billing is not configured yet.' })
  }

  const cleanSlug = slugify(slug)
  // Free subdomain on our own domain (one wildcard cert covers all of these).
  // e.g. app.industryforms.app  →  base domain industryforms.app  →  acme.industryforms.app
  const baseDomain = appUrl.replace(/^https?:\/\//, '').replace(/^app\./, '')
  const subdomainUrl = baseDomain ? `https://${cleanSlug}.${baseDomain}` : ''
  const pathUrl = `${appUrl}/site/${cleanSlug}`        // always works (incl. local/preview, before DNS)
  const publicUrl = subdomainUrl || pathUrl            // canonical public address once published

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Status / publish bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${isPublished ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="font-semibold text-gray-900">{isPublished ? 'Published' : 'Draft'}</span>
            {isPublished && (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-[var(--accent,#f97316)] hover:underline">
                View site <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a href={pathUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Preview
            </a>
            {isPublished || canPublish ? (
              <button
                onClick={togglePublish}
                disabled={saving}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${isPublished ? 'bg-gray-700 hover:bg-gray-800' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isPublished ? 'Unpublish' : 'Publish'}
              </button>
            ) : (
              <button onClick={subscribe} className="rounded-lg bg-[var(--accent,#f97316)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover,#ea580c)]">
                Publish — $19/mo
              </button>
            )}
          </div>
        </div>
        {!canPublish && !isPublished && (
          <p className="mt-3 text-sm text-gray-500">
            Build your site for free. Publishing it to the web — plus online bookings and custom hosting — is part of the <strong>$19/month Bookings Website add-on</strong>.
          </p>
        )}
      </div>

      {/* Web address */}
      <Card title="Web address">
        <label className="block text-sm font-medium text-gray-700 mb-1">Your free address</label>
        <div className="flex items-center text-sm">
          <span className="rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-2.5 py-2 text-gray-400">https://</span>
          <input value={slug} onChange={e => setSlug(e.target.value)} onBlur={() => setSlug(slugify(slug))} className="w-40 border-y border-gray-300 px-2 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          <span className="rounded-r-lg border border-l-0 border-gray-300 bg-gray-50 px-2.5 py-2 text-gray-400">.{baseDomain}</span>
        </div>
        <p className="mt-1.5 text-xs text-gray-400">Included free. Also reachable at {appUrl.replace(/^https?:\/\//, '')}/site/{cleanSlug}.</p>

        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-gray-400" />
            <label className="text-sm font-medium text-gray-700">Use your own domain</label>
            <span className="rounded-full bg-[var(--accent,#f97316)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent,#f97316)]">Add-on</span>
            {domainStatus === 'active' && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-600">Live</span>}
            {domainStatus === 'pending' && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">Pending DNS</span>}
          </div>
          <div className="flex gap-2">
            <input value={customDomain} onChange={e => setCustomDomain(e.target.value)} placeholder="www.yourbusiness.co.nz" disabled={domainStatus !== 'none'} className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-500`} />
            {domainStatus === 'none' ? (
              <button onClick={() => domainCall('POST')} disabled={domainBusy || !customDomain.trim()} className="shrink-0 rounded-lg bg-gray-800 px-4 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">
                {domainBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
              </button>
            ) : (
              <button onClick={() => domainCall('DELETE')} disabled={domainBusy} className="shrink-0 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Disconnect
              </button>
            )}
          </div>

          {dnsRecords.length > 0 && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium text-gray-600">Add these records at your domain registrar, then click verify:</p>
              <div className="space-y-2">
                {dnsRecords.map((r, i) => (
                  <div key={i} className="rounded-md bg-white border border-gray-200 p-2 text-xs font-mono break-all">
                    <span className="inline-block w-14 font-semibold text-gray-500">{r.type}</span>
                    <span className="text-gray-800">{r.name}</span>
                    <span className="mx-1 text-gray-300">→</span>
                    <span className="text-gray-800">{r.value}</span>
                    <p className="mt-0.5 font-sans text-[11px] text-gray-400">{r.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {domainStatus === 'pending' && (
            <button onClick={() => domainCall('PUT')} disabled={domainBusy} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent,#f97316)] hover:underline disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${domainBusy ? 'animate-spin' : ''}`} /> Verify DNS
            </button>
          )}
          {domainMsg && <p className="mt-2 text-xs text-gray-500">{domainMsg}</p>}
          {domainStatus === 'none' && (
            <p className="mt-1.5 text-xs text-gray-400">Connect a domain you already own. We&apos;ll issue the SSL certificate automatically once DNS is set.</p>
          )}
        </div>
      </Card>

      {/* Bookings toggle */}
      <Card title="Online bookings">
        <label className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-sm text-gray-700">
            <Calendar className="h-4 w-4 text-gray-400" />
            Show a booking button on your site
          </span>
          <button
            type="button"
            onClick={toggleBookings}
            disabled={!canPublish || saving}
            role="switch"
            aria-checked={bookingsEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${bookingsEnabled ? 'bg-[var(--accent,#f97316)]' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bookingsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </label>
        <p className="mt-1.5 text-xs text-gray-400">
          {canPublish
            ? 'Independent of publishing — you can run the site without bookings if you prefer.'
            : 'Part of the Bookings Website add-on.'}
        </p>
      </Card>

      {/* Custom site hosting */}
      <Card title="Site hosting">
        <div className="flex items-center gap-2 mb-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${siteMode === 'builder' ? 'bg-[var(--accent,#f97316)]/10 text-[var(--accent,#f97316)]' : 'bg-gray-100 text-gray-500'}`}>Builder</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${siteMode === 'custom' ? 'bg-[var(--accent,#f97316)]/10 text-[var(--accent,#f97316)]' : 'bg-gray-100 text-gray-500'}`}>Custom upload</span>
        </div>
        {siteMode === 'builder' ? (
          <>
            <p className="text-sm text-gray-600 mb-3">Using the section builder above. Instead, you can upload your own single-page static site as one HTML file (inline your CSS/JS, or link to assets you host elsewhere).</p>
            {canPublish ? (
              <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload static site
                <input
                  type="file"
                  accept=".html"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadCustomSite(f) }}
                />
              </label>
            ) : (
              <p className="text-xs text-gray-400">Requires the Bookings Website add-on.</p>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Serving your uploaded static site.
              {customSiteStatus === 'disabled' && <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-medium"><Ban className="h-3.5 w-3.5" /> Disabled by support</span>}
            </p>
            <div className="flex gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Replace upload
                <input
                  type="file"
                  accept=".html"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadCustomSite(f) }}
                />
              </label>
              <button onClick={switchToBuilder} disabled={saving} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                Switch back to builder
              </button>
            </div>
          </div>
        )}
        {uploadMsg && <p className="mt-2 text-xs text-gray-500">{uploadMsg}</p>}
      </Card>

      {/* Theme */}
      <Card title="Theme">
        <ThemeCard
          theme={theme}
          setTheme={setTheme}
          logoUrl={logoUrl}
          companyId={companyId}
          setLogoUrl={setLogoUrl}
        />
      </Card>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((section, idx) => (
          <Card
            key={idx}
            title={SECTION_LABELS[section.type]}
            actions={
              <div className="flex items-center gap-1 text-gray-400">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1 hover:text-gray-700 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                <button onClick={() => move(idx, 1)} disabled={idx === sections.length - 1} className="p-1 hover:text-gray-700 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                <button onClick={() => remove(idx)} className="p-1 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            }
          >
            <SectionEditor section={section} idx={idx} patch={patchSection} photoUrls={photoUrls} onExcludePhoto={excludePhoto} />
          </Card>
        ))}

        {/* Add section */}
        <div className="relative">
          <button onClick={() => setAddOpen(o => !o)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-orange-400 hover:text-[var(--accent,#f97316)]">
            <Plus className="h-4 w-4" /> Add section
          </button>
          {addOpen && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
              {ALL_TYPES.map(t => (
                <button key={t} onClick={() => add(t)} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                  {SECTION_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SEO */}
      <Card title="Search & sharing">
        <label className="block text-sm font-medium text-gray-700 mb-1">Page title</label>
        <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} className={inputCls} />
        <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">Description</label>
        <textarea value={seoDescription} onChange={e => setSeoDescription(e.target.value)} rows={2} className={inputCls} />
      </Card>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        {msg && (
          <span className={`inline-flex items-center gap-1.5 text-sm ${msg.kind === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {msg.kind === 'ok' && <Check className="h-4 w-4" />}{msg.text}
          </span>
        )}
        <button onClick={() => save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent,#f97316)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </div>
    </div>
  )
}

function Card({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  )
}

// Theme card: brand colour + font, with three friendly ways to pick a colour:
//   1. Logo preview that doubles as a click-to-sample target.
//   2. Native EyeDropper API (Chrome/Edge only — feature-detected).
//   3. AI palette: dominant colours extracted from the logo as one-click swatches.
function ThemeCard({
  theme, setTheme, logoUrl, companyId, setLogoUrl,
}: {
  theme: WebsiteTheme
  setTheme: (t: WebsiteTheme) => void
  logoUrl: string | null
  companyId: string
  setLogoUrl: (url: string | null) => void
}) {
  const supabase = createClient()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg] = useState<string | null>(null)
  const [palette, setPalette] = useState<string[]>([])
  const [paletteLoading, setPaletteLoading] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const supportsEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window

  // Uploads to the company's logo_url — the same logo shown on invoices,
  // quotes, and Settings → Business (there's one company logo, not a
  // website-specific one), so this stays in sync everywhere.
  async function uploadLogo(file: File) {
    setLogoUploading(true)
    setLogoMsg(null)
    const ext = file.name.split('.').pop() ?? 'png'
    const res = await fetch('/api/storage/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'company-logo', ext, contentType: file.type }),
    })
    if (!res.ok) { setLogoMsg((await res.json().catch(() => ({}))).error ?? 'Upload failed'); setLogoUploading(false); return }
    const { url, publicUrl } = await res.json()

    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
    if (!put.ok) { setLogoMsg('Upload to storage failed'); setLogoUploading(false); return }

    const bustedUrl = `${publicUrl}?v=${Date.now()}`
    const { error } = await supabase.from('companies').update({ logo_url: bustedUrl }).eq('id', companyId)
    setLogoUploading(false)
    if (error) { setLogoMsg(error.message); return }
    setLogoUrl(bustedUrl)
    setLogoMsg('Logo updated')
  }

  async function removeLogo() {
    const { error } = await supabase.from('companies').update({ logo_url: null }).eq('id', companyId)
    if (error) { setLogoMsg(error.message); return }
    setLogoUrl(null)
    setPalette([])
    setLogoMsg('Logo removed')
  }

  // Auto-suggest a palette the first time we render with a logo. Refreshable
  // via the Sparkles button.
  useEffect(() => {
    if (!logoUrl) return
    setPaletteLoading(true)
    extractPalette(logoUrl, 5)
      .then(p => setPalette(p))
      .catch(() => setHint('Could not read your logo image'))
      .finally(() => setPaletteLoading(false))
  }, [logoUrl])

  async function onLogoClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!logoUrl) return
    const rect = e.currentTarget.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const c = await samplePixel(logoUrl, nx, ny)
    if (c) { setTheme({ ...theme, primary: c }); setHint(`Picked ${c} from logo`) }
  }

  async function useEyedropper() {
    type ED = { open: () => Promise<{ sRGBHex: string }> }
    const Ctor = (window as unknown as { EyeDropper?: new () => ED }).EyeDropper
    if (!Ctor) return
    try {
      const { sRGBHex } = await new Ctor().open()
      setTheme({ ...theme, primary: sRGBHex })
      setHint(`Picked ${sRGBHex} with eyedropper`)
    } catch { /* user cancelled */ }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Style</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {WEBSITE_STYLES.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => setTheme({ ...theme, style: s.key })}
              className={`text-left rounded-xl border-2 p-3 transition-colors ${theme.style === s.key ? 'border-gray-900' : 'border-gray-200 hover:border-gray-300'}`}
            >
              <div className="flex h-10 overflow-hidden rounded-lg mb-2.5">
                {s.swatch.map((c, i) => <div key={i} className="flex-1" style={{ background: c }} />)}
              </div>
              <p className="text-sm font-semibold text-gray-900">{s.label}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{s.blurb}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {/* Logo preview — also acts as a clickable colour picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Your logo</label>
          {logoUrl ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo"
                onClick={onLogoClick}
                title="Click anywhere on the logo to pick that colour"
                className="h-16 w-auto max-w-[180px] object-contain rounded-lg border border-gray-200 bg-white p-1 cursor-crosshair"
              />
              <button
                type="button"
                onClick={removeLogo}
                title="Remove logo"
                className="absolute -top-2 -right-2 bg-white border border-gray-200 rounded-full p-0.5 hover:bg-red-50 hover:border-red-200 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-400" />
              </button>
            </div>
          ) : (
            <div className="h-16 w-32 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-xs text-gray-400">
              No logo yet
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
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={logoUploading}
            className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            <Upload className="h-3 w-3" />
            {logoUploading ? 'Uploading...' : logoUrl ? 'Change logo' : 'Upload logo'}
          </button>
          {logoUrl && <p className="text-[11px] text-gray-400 mt-1">Click the logo to grab that colour</p>}
          {logoMsg && <p className="text-[11px] text-gray-400 mt-1">{logoMsg}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Brand colour</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={theme.primary}
              onChange={e => setTheme({ ...theme, primary: e.target.value })}
              className="h-10 w-12 rounded border border-gray-300 cursor-pointer"
            />
            <span className="text-xs font-mono text-gray-600">{theme.primary}</span>
            {supportsEyedropper && (
              <button
                type="button"
                onClick={useEyedropper}
                title="Pick a colour from anywhere on screen"
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
              >
                <Pipette className="h-3.5 w-3.5" /> Eyedropper
              </button>
            )}
          </div>
        </div>
      </div>

      {/* AI palette — dominant colours pulled from the uploaded logo */}
      {logoUrl && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600 inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-purple-500" /> Suggested from your logo
            </span>
            <button
              type="button"
              onClick={() => {
                if (!logoUrl) return
                setPaletteLoading(true)
                extractPalette(logoUrl, 5).then(setPalette).finally(() => setPaletteLoading(false))
              }}
              disabled={paletteLoading}
              className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${paletteLoading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {palette.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {palette.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setTheme({ ...theme, primary: c }); setHint(`Picked ${c} from palette`) }}
                  title={c}
                  className={`h-9 w-9 rounded-md border-2 transition-transform hover:scale-105 ${theme.primary.toLowerCase() === c.toLowerCase() ? 'border-gray-900' : 'border-gray-200'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          ) : !paletteLoading ? (
            <p className="text-xs text-gray-400">No distinct colours found — try a different logo or pick manually.</p>
          ) : null}
        </div>
      )}

      {hint && <p className="text-xs text-green-600">{hint}</p>}
    </div>
  )
}

function SectionEditor({
  section, idx, patch, photoUrls, onExcludePhoto,
}: {
  section: WebsiteSection
  idx: number
  patch: (idx: number, p: Partial<WebsiteSection>) => void
  photoUrls: string[]
  onExcludePhoto: (url: string) => void
}) {
  switch (section.type) {
    case 'hero':
      return (
        <div className="space-y-3">
          <Field label="Heading"><input value={section.heading} onChange={e => patch(idx, { heading: e.target.value })} className={inputCls} /></Field>
          <Field label="Subheading"><input value={section.subheading} onChange={e => patch(idx, { subheading: e.target.value })} className={inputCls} /></Field>
          <Field label="Button label"><input value={section.ctaLabel} onChange={e => patch(idx, { ctaLabel: e.target.value })} className={inputCls} /></Field>
          <Field label="Background image (optional)">
            <PhotoPicker photoUrls={photoUrls} selected={section.imageUrl ? [section.imageUrl] : []} onToggle={url => patch(idx, { imageUrl: section.imageUrl === url ? undefined : url })} onExclude={onExcludePhoto} single />
          </Field>
        </div>
      )
    case 'about':
      return (
        <div className="space-y-3">
          <Field label="Heading"><input value={section.heading} onChange={e => patch(idx, { heading: e.target.value })} className={inputCls} /></Field>
          <Field label="Body"><textarea value={section.body} onChange={e => patch(idx, { body: e.target.value })} rows={4} className={inputCls} /></Field>
        </div>
      )
    case 'services':
      return (
        <div className="space-y-3">
          <Field label="Heading"><input value={section.heading} onChange={e => patch(idx, { heading: e.target.value })} className={inputCls} /></Field>
          {section.items.map((it, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
              <div className="flex gap-2">
                <input value={it.title} onChange={e => patch(idx, { items: section.items.map((x, k) => k === i ? { ...x, title: e.target.value } : x) })} placeholder="Service name" className={inputCls} />
                <button onClick={() => patch(idx, { items: section.items.filter((_, k) => k !== i) })} className="shrink-0 px-2 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <input value={it.description} onChange={e => patch(idx, { items: section.items.map((x, k) => k === i ? { ...x, description: e.target.value } : x) })} placeholder="Short description" className={inputCls} />
            </div>
          ))}
          <button onClick={() => patch(idx, { items: [...section.items, { title: '', description: '' }] })} className="text-sm font-medium text-[var(--accent,#f97316)] hover:underline">+ Add service</button>
        </div>
      )
    case 'gallery':
      return (
        <div className="space-y-3">
          <Field label="Heading"><input value={section.heading} onChange={e => patch(idx, { heading: e.target.value })} className={inputCls} /></Field>
          <Field label="Choose photos from your jobs">
            <PhotoPicker photoUrls={photoUrls} selected={section.images} onToggle={url => patch(idx, { images: section.images.includes(url) ? section.images.filter(u => u !== url) : [...section.images, url] })} onExclude={onExcludePhoto} />
          </Field>
        </div>
      )
    case 'testimonials':
      return (
        <div className="space-y-3">
          <Field label="Heading"><input value={section.heading} onChange={e => patch(idx, { heading: e.target.value })} className={inputCls} /></Field>
          {section.items.map((it, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
              <div className="flex gap-2">
                <textarea value={it.quote} onChange={e => patch(idx, { items: section.items.map((x, k) => k === i ? { ...x, quote: e.target.value } : x) })} placeholder="What the customer said" rows={2} className={inputCls} />
                <button onClick={() => patch(idx, { items: section.items.filter((_, k) => k !== i) })} className="shrink-0 px-2 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
              </div>
              <input value={it.author} onChange={e => patch(idx, { items: section.items.map((x, k) => k === i ? { ...x, author: e.target.value } : x) })} placeholder="Customer name" className={inputCls} />
            </div>
          ))}
          <button onClick={() => patch(idx, { items: [...section.items, { quote: '', author: '' }] })} className="text-sm font-medium text-[var(--accent,#f97316)] hover:underline">+ Add testimonial</button>
        </div>
      )
    case 'contact':
      return (
        <div className="space-y-3">
          <Field label="Heading"><input value={section.heading} onChange={e => patch(idx, { heading: e.target.value })} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={section.showForm} onChange={e => patch(idx, { showForm: e.target.checked })} className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
            Show enquiry form (submissions appear in Enquiries)
          </label>
        </div>
      )
    case 'booking':
      return (
        <div className="space-y-3">
          <Field label="Heading"><input value={section.heading} onChange={e => patch(idx, { heading: e.target.value })} className={inputCls} /></Field>
          <Field label="Subheading"><input value={section.subheading ?? ''} onChange={e => patch(idx, { subheading: e.target.value })} className={inputCls} /></Field>
          <Field label="Button label"><input value={section.ctaLabel ?? ''} onChange={e => patch(idx, { ctaLabel: e.target.value })} className={inputCls} /></Field>
          <p className="text-xs text-gray-400">Only shows on the live site when Online bookings is turned on above.</p>
        </div>
      )
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  )
}

function PhotoPicker({ photoUrls, selected, onToggle, onExclude, single }: { photoUrls: string[]; selected: string[]; onToggle: (url: string) => void; onExclude: (url: string) => void; single?: boolean }) {
  if (!photoUrls.length) return <p className="text-sm text-gray-400">No job photos yet — add photos to jobs to use them here.</p>
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
      {photoUrls.map(url => {
        const on = selected.includes(url)
        return (
          <div key={url} className="group relative aspect-square">
            <button type="button" onClick={() => onToggle(url)} className={`relative h-full w-full overflow-hidden rounded-lg border-2 ${on ? 'border-[var(--accent,#f97316)]' : 'border-transparent'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {on && <span className="absolute inset-0 flex items-center justify-center bg-[var(--accent,#f97316)]/30"><Check className="h-5 w-5 text-white" /></span>}
              {single && on && <span className="absolute right-1 top-1 rounded bg-[var(--accent,#f97316)] px-1 text-[9px] font-bold text-white">BG</span>}
            </button>
            <button
              type="button"
              onClick={() => onExclude(url)}
              title="Hide this photo from the website picker"
              className="absolute -top-1.5 -left-1.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-gray-900/80 text-white hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
