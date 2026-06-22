// Google Business Profile sync — STUB.
//
// The Google Business Profile (GBP) APIs (Business Information API, Business
// Posts API, Account Management API) require manual application + approval
// from Google; tokens are gated by an OAuth flow that needs a verified place
// owner. We can't sandbox this without an approved project.
//
// Wiring plan once approved:
//   1. Settings → Integrations: connect GBP (OAuth, same shape as Google
//      Calendar at /api/google/auth + /api/google/callback).
//   2. Store the location resource name on companies.gbp_location_name.
//   3. POST hours / photos / a "we're hiring" post via the Business
//      Information API + Posts API after the owner publishes their site.
//
// Until approval is obtained, calling these functions is a no-op so the rest
// of the SEO commit (sitemap, robots, OG, canonical) can ship independently.

export async function syncGbpFromWebsite(_companyId: string): Promise<{ skipped: true; reason: string }> {
  return { skipped: true, reason: 'GBP API access not yet approved' }
}
