# Wholesaler / Association Partnership & Referral Program — Scope

Last updated: 2026-08-11. Planning doc for the biggest-leverage, lowest-cost
distribution channel identified alongside the Tradify/Jobber/ServiceM8/Fergus
comparison pages (`alternatives/*.html`) — not started, no code yet.

## The idea

Borrow an existing captive audience instead of building one. A trade
wholesaler, supplier, or industry association already has thousands of
tradespeople as customers/members who trust their recommendation. One deal
can reach more real prospects than months of solo content/SEO.

## Who to target, roughly in order of fit

1. **Trade wholesalers/merchants** (electrical wholesalers, plumbing supply
   houses, builders' merchants — regional NZ/AU chains, not the big-box
   consumer stores). Their customer base is almost 1:1 our ICP (a trade
   business owner who buys materials weekly). Best channel because the
   relationship is already commercial, not community goodwill — easier to
   formalize into a paid arrangement.
2. **Trade associations** (Master Electricians, Master Plumbers NZ, Certified
   Builders, EWRB/PGDB-adjacent bodies, Site Safe). Slower to close (often
   committee-driven, may want a vetting process) but a member-newsletter
   mention or "member benefits" listing reaches a large, pre-qualified list at
   effectively zero marginal cost once secured.
3. **Apprenticeship/training providers** (BCITO and equivalents). Longest
   payback — apprentices aren't buyers yet — but builds brand familiarity in
   the next generation of business owners for near-zero cost (a guest slot in
   existing training material, not a media buy).

## Two structures — pick one to start, don't build both

### A. Straight referral / affiliate (lowest cost, fastest to launch)

- Partner gets a unique referral link or code; each signup that converts to a
  paid plan earns them a **flat commission** (e.g., one month's subscription
  value, or a fixed $ amount — needs a number decided, not zero).
- No upfront cost to us — pure pay-on-conversion. This is the one to pitch
  first to a wholesaler: zero risk for them to say yes to a mention in their
  newsletter or a flyer at checkout.
- **What this needs in the app** (not built yet):
  - A `referral_code` on `companies` (or a small `referral_partners` table:
    id, name, code, commission_type, commission_value, payout_details).
  - Attribution capture on signup — a `?ref=` query param stored in the
    signup flow before `companies` row creation, same pattern as any other
    UTM/attribution field would need.
  - A simple admin view to see signups-per-code and mark commissions paid
    (manual payout to start — do not build automated payouts before there's
    volume to justify it).
  - Nothing customer-facing needed beyond the link — this can launch with a
    spreadsheet-simple admin view.

### B. Co-marketing / sponsored placement (bigger reach, needs a budget line)

- Pay a wholesaler or association a flat fee (or trade free/discounted
  subscriptions for their own staff) for a newsletter mention, a page in
  their supplier directory, or a stand at a trade day.
- Better for associations, who often can't legally structure a per-signup
  kickback the way a private wholesaler can, and who value the "member deal"
  framing over a commission.
- No app changes needed to start — this is a pure business-dev / cash-spend
  motion. Only worth it once there's a rough sense of what a signup is worth
  (from running A first), so the deal isn't priced blind.

## Recommended sequence

1. **Do A with one wholesaler first**, informally if needed (a tracked link
   is enough before building the admin table) — this produces the first real
   conversion-rate and CAC numbers.
2. Use those numbers to price a **B-style deal** with a trade association,
   where you can point to "X sign-ups per Y newsletter mentions" from a real
   pilot instead of guessing.
3. Only build the `referral_partners` table + admin view once a second
   partner is confirmed — one partner can run on a manually-tracked link.

## Open questions to decide before pitching anyone

- **Commission value**: a flat dollar amount is simpler to explain to a
  wholesaler than a % of subscription — decide the number before the first
  conversation, not during it.
- **Who owns the relationship** day-to-day (renewing the deal, chasing
  payout, updating the newsletter copy) — this is an ongoing relationship
  cost, not a one-time setup.
- **Exclusivity**: would a wholesaler want to be "the" trade software they
  recommend (i.e., you'd need to not also be doing a deal with their direct
  competitor)? Decide your position before it's asked.

## Not in scope here

Multi-tier/MLM-style referral chains, self-serve partner sign-up portal,
automated Stripe-based commission payout — all premature before a single
partner is proven out. Revisit only once there are enough partners that
manual tracking becomes the bottleneck.
