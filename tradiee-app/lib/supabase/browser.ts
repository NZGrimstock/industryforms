import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // Password recovery links must work when opened on a different device/browser
    // than the one that requested them — PKCE's code_verifier can't survive that,
    // so recovery uses the implicit flow (tokens land in the URL hash instead).
    { auth: { flowType: 'implicit' } },
  )
}
