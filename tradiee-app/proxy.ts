import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// host → slug cache (best-effort, per edge isolate; short TTL)
const domainCache = new Map<string, { slug: string | null; at: number }>()
const DOMAIN_TTL = 60_000

async function resolveCustomDomain(host: string): Promise<string | null> {
  const hit = domainCache.get(host)
  if (hit && Date.now() - hit.at < DOMAIN_TTL) return hit.slug
  let slug: string | null = null
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (url && key) {
      const res = await fetch(
        `${url}/rest/v1/company_websites?custom_domain=eq.${encodeURIComponent(host)}&is_published=eq.true&domain_status=eq.active&select=slug`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      )
      if (res.ok) {
        const rows = await res.json()
        slug = rows?.[0]?.slug ?? null
      }
    }
  } catch {
    slug = null
  }
  domainCache.set(host, { slug, at: Date.now() })
  return slug
}

// slug → site hosting config cache (site_mode/custom_site_key), same TTL pattern.
type SiteConfig = { siteMode: string; customSiteKey: string | null; customSiteStatus: string }
const siteConfigCache = new Map<string, { config: SiteConfig | null; at: number }>()

async function resolveSiteConfig(slug: string): Promise<SiteConfig | null> {
  const hit = siteConfigCache.get(slug)
  if (hit && Date.now() - hit.at < DOMAIN_TTL) return hit.config
  let config: SiteConfig | null = null
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (url && key) {
      const res = await fetch(
        `${url}/rest/v1/company_websites?slug=eq.${encodeURIComponent(slug)}&is_published=eq.true&select=site_mode,custom_site_key,custom_site_status`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      )
      if (res.ok) {
        const rows = await res.json()
        const row = rows?.[0]
        config = row ? { siteMode: row.site_mode, customSiteKey: row.custom_site_key, customSiteStatus: row.custom_site_status } : null
      }
    }
  } catch {
    config = null
  }
  siteConfigCache.set(slug, { config, at: Date.now() })
  return config
}

// Custom-hosted static site: reverse-proxy the uploaded HTML from the public
// R2/CDN bucket. The visitor's address bar stays on their own domain; the
// content itself runs at the CDN's origin (cdn.industryforms.app), never
// app.industryforms.app — app session cookies are host-only scoped to
// app.industryforms.app and are never sent to either origin. Restrictive CSP
// stops the uploaded page from framing the dashboard or calling app APIs
// with credentials.
function serveCustomSite(customSiteKey: string): NextResponse {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
  const res = NextResponse.rewrite(new URL(`${base}/${customSiteKey}`))
  res.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'none'; connect-src 'self' https://cdn.industryforms.app; form-action 'self'"
  )
  return res
}

// Decides how to route a resolved public-site slug: serve the uploaded custom
// site, show a takedown notice, or return null to fall through to the normal
// /site/<slug> builder rewrite.
function routeForSiteConfig(config: SiteConfig | null): NextResponse | null {
  if (config?.siteMode !== 'custom') return null
  if (config.customSiteStatus === 'active' && config.customSiteKey) return serveCustomSite(config.customSiteKey)
  if (config.customSiteStatus === 'disabled') {
    return new NextResponse('This site is currently unavailable.', { status: 403 })
  }
  return null
}

export async function proxy(request: NextRequest) {
  // ── Instant Website subdomains ───────────────────────────────────────────
  // A free per-tenant subdomain `<slug>.industryforms.app` is served by the
  // public site route. The base (app) domain is derived from NEXT_PUBLIC_APP_URL
  // (e.g. app.industryforms.app → industryforms.app). One wildcard cert covers
  // every subdomain, so no per-tenant SSL is needed. Custom domains (the user's
  // own) are a separate, deferred Cloudflare-for-SaaS flow.
  const hostname = (request.headers.get('host') ?? '').split(':')[0]
  const appDomain = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/^https?:\/\//, '').split(':')[0]
  const baseDomain = appDomain.replace(/^app\./, '')
  const isAppDomain = !hostname || hostname === appDomain || hostname.startsWith('localhost') || /^\d/.test(hostname)
  const { pathname } = request.nextUrl
  const passThrough = pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/site/')

  if (baseDomain && hostname.endsWith(`.${baseDomain}`) && hostname !== appDomain) {
    // Free per-tenant subdomain: <slug>.industryforms.app → /site/<slug>
    const sub = hostname.slice(0, -(baseDomain.length + 1))
    if (sub && sub !== 'www' && sub !== 'app' && !sub.includes('.')) {
      if (!passThrough) {
        const routed = routeForSiteConfig(await resolveSiteConfig(sub))
        if (routed) return routed
        const url = request.nextUrl.clone()
        // Preserve any nested path (/sitemap.xml, /robots.txt, /book) so we
        // can serve site-scoped routes from inside /site/[slug]/.
        url.pathname = `/site/${sub}${pathname === '/' ? '' : pathname}`
        return NextResponse.rewrite(url)
      }
      return NextResponse.next({ request })
    }
  } else if (!isAppDomain) {
    // A customer's own domain (Cloudflare for SaaS proxies it to us): resolve the
    // Host header to the owning site's slug, then serve the public site.
    if (!passThrough) {
      const slug = await resolveCustomDomain(hostname)
      if (slug) {
        const routed = routeForSiteConfig(await resolveSiteConfig(slug))
        if (routed) return routed
        const url = request.nextUrl.clone()
        url.pathname = `/site/${slug}${pathname === '/' ? '' : pathname}`
        return NextResponse.rewrite(url)
      }
    }
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Public routes that don't need auth. Anything NOT listed here redirects a
  // signed-out visitor to /login, so every page a logged-out person is
  // legitimately sent to must be here — including the legal pages linked from
  // the signup form and both app stores, and the token links we email out.
  const publicPaths = [
    '/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback',
    '/q/', '/i/', '/site/', '/api/',
    '/terms', '/privacy', '/account-deletion', '/invite/', '/portal/',
  ]
  const isPublic = publicPaths.some(p => pathname.startsWith(p))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
