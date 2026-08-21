import type { PlanKey } from './plans'

export type BillingCompany = {
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
  billing_exempt?: boolean | null
  comp_plan?: string | null
  comp_until?: string | null
}

/**
 * The plan that actually governs a company's limits right now — NOT the raw
 * `subscription_plan` column, which stays 'trial' forever once the trial
 * lapses (nothing transitions it). Once trial_ends_at passes with no active
 * subscription, a company falls through to the permanent 'free' floor rather
 * than losing access (see hasAccess() below). comp_plan/comp_until is an
 * operator-granted temporary plan (set from the separate Industry Forms
 * Admin console — friends/testers, not a customer billing mechanism):
 * outranks trial/free but never a real active subscription or billing_exempt.
 * Mirrored in SQL by company_effective_plan() for the job/customer row-cap
 * triggers — flagged there as a drift risk, same as job_is_locked()/invoiceGuard().
 */
/** Whether a comp grant is currently in effect (not expired, not cleared). */
export function isCompActive(company: BillingCompany | null): boolean {
  return !!company?.comp_plan && !!company?.comp_until && new Date(company.comp_until).getTime() > Date.now()
}

export function effectivePlanKey(company: BillingCompany | null): PlanKey {
  if (!company) return 'free'
  if (company.billing_exempt) return 'pro'
  if (company.subscription_status === 'active') return (company.subscription_plan as PlanKey) ?? 'free'
  if (isCompActive(company)) return company.comp_plan as PlanKey
  if (company.trial_ends_at && new Date(company.trial_ends_at).getTime() > Date.now()) return 'trial'
  return 'free'
}

/**
 * Server-route convenience for the many free-tier feature gates below — one
 * query instead of repeating the select + effectivePlanKey() call at every
 * route. Fails closed (treats a missing company as free) since every caller
 * uses this to decide whether to allow a premium action.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function isFreePlanCompany(service: any, companyId: string): Promise<boolean> {
  const { data } = await service.from('companies').select('subscription_plan, subscription_status, trial_ends_at, billing_exempt, comp_plan, comp_until').eq('id', companyId).single()
  return effectivePlanKey(data) === 'free'
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
 * Whether an account may use the app at all. Always true now — a lapsed
 * trial with no subscription falls through to the free plan (see
 * effectivePlanKey()) instead of losing access. Kept as a named function,
 * not deleted, as the one choke point for any future suspension/fraud gate.
 */
export function hasAccess(_isSuperAdmin: boolean, _company: BillingCompany | null): boolean {
  return true
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
