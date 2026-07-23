export type BillingCompany = {
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
  billing_exempt: boolean | null
}

// Codex build audit marker (2026-07-08): paid add-ons are Stripe-owned in prod.
export const BILLING_ADDONS = {
  projects: {
    label: 'Projects',
    monthly: 19,
    lookupKey: 'projects_monthly',
    returnPath: '/projects',
  },
  bookings_website: {
    label: 'Bookings Website',
    monthly: 19,
    lookupKey: 'bookings_website_monthly',
    returnPath: '/website',
  },
  sms_usage: {
    label: 'SMS',
    monthly: 0,
    lookupKey: 'sms_usage_metered',
    returnPath: '/settings?tab=subscription',
    usagePriceCents: 13,
  },
} as const

export type BillingAddonSlug = keyof typeof BILLING_ADDONS

/**
 * Whether an account may use the app. Access is granted when ANY of:
 *  - the user is a super admin (unrestricted), or
 *  - the company is billing-exempt (comped / app-store review account), or
 *  - the company has an active paid subscription, or
 *  - the company is still inside its trial window.
 * Otherwise the trial has lapsed with no subscription → paywalled.
 */
export function hasAccess(isSuperAdmin: boolean, company: BillingCompany | null): boolean {
  if (isSuperAdmin) return true
  if (!company) return false
  if (company.billing_exempt) return true
  if (company.subscription_status === 'active') return true
  if (company.trial_ends_at && new Date(company.trial_ends_at).getTime() > Date.now()) return true
  return false
}

/**
 * Stricter than hasAccess: a *paid* plan, NOT a free trial. Used to gate
 * card-present (Tap to Pay) collection — a fraudster won't pay a monthly
 * subscription and wait, so requiring a real paid plan (or a comped/review
 * account) shrinks the population that can ever take a card payment. Mirrors
 * the `notOnFreeTrial` check already used in app/api/site/custom/upload.
 */
export function hasPaidPlan(isSuperAdmin: boolean, company: Pick<BillingCompany, 'subscription_status' | 'billing_exempt'> | null): boolean {
  if (isSuperAdmin) return true
  if (!company) return false
  if (company.billing_exempt) return true
  return company.subscription_status === 'active'
}

/**
 * Whether the company has a given paid add-on active. Super-admins and
 * billing-exempt review accounts get every add-on for free. Add-ons are stored
 * on `companies.addons` as `{ "<slug>": { "active": true } }` — flipped by the
 * Stripe webhook. Billing-exempt/review accounts may still be toggled directly
 * by /api/billing/addon because they never enter Stripe.
 */
type CompanyWithAddons = { addons?: Record<string, { active?: boolean } & Record<string, unknown>> | null; billing_exempt?: boolean | null }
export function hasAddon(isSuperAdmin: boolean, company: CompanyWithAddons | null, slug: string): boolean {
  if (isSuperAdmin) return true
  if (!company) return false
  if (company.billing_exempt) return true
  return company.addons?.[slug]?.active === true
}

/**
 * Flip a company's add-on flag in the companies.addons JSONB. Read-modify-write
 * on a single boolean is naturally idempotent — safe to call repeatedly for the
 * same (companyId, slug, active), which Stripe webhook retries require.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setAddonActive(supabase: any, companyId: string, slug: string, active: boolean, metadata: Record<string, unknown> = {}): Promise<void> {
  const { data: company } = await supabase.from('companies').select('addons').eq('id', companyId).single()
  const addons = { ...((company?.addons ?? {}) as Record<string, { active?: boolean } & Record<string, unknown>>) }
  addons[slug] = { ...(addons[slug] ?? {}), ...metadata, active }
  await supabase.from('companies').update({ addons }).eq('id', companyId)
}
