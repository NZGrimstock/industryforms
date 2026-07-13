// Stripe Connect (Express) onboarding + status sync.
//
// Each company gets its own connected account so customer payments (invoices,
// booking deposits, Tap to Pay) settle to the tradie, not the platform. No
// application fee — IndustryForms monetises via subscriptions.
// Phase 2 (Tap to Pay direct charges) will additionally request the
// card_present_payments capability here.
import { getStripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase/server'

type CompanyRow = {
  id: string
  name: string | null
  email: string | null
  country: string | null
  stripe_account_id: string | null
}

// Create the Express account if the company doesn't have one yet; return its id.
export async function ensureConnectedAccount(company: CompanyRow): Promise<string> {
  if (company.stripe_account_id) return company.stripe_account_id

  const stripe = getStripe()
  const account = await stripe.accounts.create({
    type: 'express',
    country: company.country === 'AU' ? 'AU' : 'NZ',
    email: company.email ?? undefined,
    business_profile: { name: company.name ?? undefined },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { company_id: company.id },
  })

  const { error } = await createServiceClient()
    .from('companies')
    .update({ stripe_account_id: account.id })
    .eq('id', company.id)
  if (error) throw new Error(`Failed to save connected account: ${error.message}`)

  return account.id
}

// Hosted onboarding link. refresh_url is hit if the link expires mid-flow;
// return_url is where Stripe sends them when done (status is re-synced there).
export async function createOnboardingLink(accountId: string): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${appUrl}/api/stripe/connect/onboard?refresh=1`,
    return_url: `${appUrl}/settings?connect=done`,
    type: 'account_onboarding',
  })
  return link.url
}

// Pull the live capability flags from Stripe and persist them. Called from the
// status route and the account.updated webhook so the UI reflects reality.
export async function syncAccountStatus(accountId: string): Promise<{
  charges_enabled: boolean
  payouts_enabled: boolean
  details_submitted: boolean
}> {
  const account = await getStripe().accounts.retrieve(accountId)
  const status = {
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    details_submitted: !!account.details_submitted,
  }
  await createServiceClient()
    .from('companies')
    .update({
      stripe_charges_enabled: status.charges_enabled,
      stripe_payouts_enabled: status.payouts_enabled,
      stripe_details_submitted: status.details_submitted,
    })
    .eq('stripe_account_id', accountId)
  return status
}
