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

  // Public routes that don't need auth
  const publicPaths = ['/login', '/signup', '/auth/callback', '/q/', '/i/', '/site/', '/api/']
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
