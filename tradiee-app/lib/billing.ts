export type BillingCompany = {
  subscription_status: string | null
  subscription_plan: string | null
  trial_ends_at: string | null
  billing_exempt: boolean | null
}

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
 * Whether the company has a given paid add-on active. Super-admins and
 * billing-exempt review accounts get every add-on for free. Add-ons are stored
 * on `companies.addons` as `{ "<slug>": { "active": true } }` — flipped by the
 * Stripe webhook (and by /api/billing/addon for the dev/super-admin path).
 */
type CompanyWithAddons = { addons?: Record<string, { active?: boolean }> | null; billing_exempt?: boolean | null }
export function hasAddon(isSuperAdmin: boolean, company: CompanyWithAddons | null, slug: string): boolean {
  if (isSuperAdmin) return true
  if (!company) return false
  if (company.billing_exempt) return true
  return company.addons?.[slug]?.active === true
}
