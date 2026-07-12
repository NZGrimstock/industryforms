// POST /api/site/custom/upload — multipart/form-data, field "file".
// Uploads a single static HTML file to serve as the company's custom-hosted
// site instead of the section builder. Owner/admin only, requires the
// Bookings Website add-on AND an active paid subscription (free-trial
// accounts are blocked from custom hosting — arbitrary third-party code
// needs a card on file for accountability/takedown leverage).
//
// Scoped to a single HTML file for now: zip-of-assets support needs its own
// careful pass on zip-slip/path-traversal and zip-bomb handling before it's
// safe to ship, and isn't required for a usable MVP.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasAddon } from '@/lib/billing'
import { putObject, PUBLIC_BUCKET } from '@/lib/r2'
import { slugify } from '@/lib/website'

const MAX_SIZE = 2 * 1024 * 1024 // 2MB — generous for a single inlined HTML page

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id, is_super_admin, companies!company_id(name, addons, billing_exempt, subscription_status)')
    .eq('id', user.id)
    .single()
  if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Only owners or admins can change site hosting.' }, { status: 403 })
  }

  const company = profile.companies as unknown as { name: string; addons: Record<string, { active?: boolean }> | null; billing_exempt: boolean | null; subscription_status: string | null } | null
  const isSuperAdmin = !!profile.is_super_admin
  const entitled = hasAddon(isSuperAdmin, company, 'bookings_website')
  const notOnFreeTrial = isSuperAdmin || !!company?.billing_exempt || company?.subscription_status === 'active'
  if (!entitled || !notOnFreeTrial) {
    return NextResponse.json({ error: 'Custom hosting requires an active Bookings Website subscription.' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  if (file.size === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File is too large (2MB limit)' }, { status: 400 })

  const looksLikeHtml = file.name.toLowerCase().endsWith('.html') || file.type === 'text/html'
  if (!looksLikeHtml) return NextResponse.json({ error: 'Only a single .html file is supported right now' }, { status: 400 })

  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `custom-sites/${profile.company_id}/index.html`
  await putObject(PUBLIC_BUCKET, key, bytes, 'text/html; charset=utf-8')

  const service = createServiceClient()
  const { data: existing } = await service.from('company_websites').select('slug').eq('company_id', profile.company_id).maybeSingle()
  const { error } = await service.from('company_websites').upsert({
    company_id: profile.company_id,
    slug: existing?.slug ?? slugify(company?.name ?? profile.company_id),
    site_mode: 'custom',
    custom_site_key: key,
    custom_site_status: 'active',
  }, { onConflict: 'company_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, key })
}
