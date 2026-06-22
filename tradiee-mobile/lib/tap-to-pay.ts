// Tap to Pay client wiring for the mobile app.
//
// Native dependencies (install once, then rebuild the APK):
//   npm install @stripe/stripe-terminal-react-native --legacy-peer-deps
//   # iOS only — `pod install` in tradiee-mobile/ios; for Tap to Pay on
//   # iPhone Apple also requires the entitlement com.apple.developer.proximity-reader
//   # and a contracted Stripe + Apple account.
//
// Android (Tap to Pay on Android) needs Google Mobile Services + NFC
// permission already present in Expo's bare workflow AndroidManifest.
//
// Once the package is installed, wrap the app's root with `<StripeTerminalProvider>`
// and use `useStripeTerminal()` in the payment screen:
//
//   const { discoverReaders, connectLocalMobileReader, collectPaymentMethod, confirmPaymentIntent } = useStripeTerminal()
//
// The flow is:
//   1. POST /api/stripe/terminal/connection-token  → secret
//   2. discoverReaders({ discoveryMethod: 'localMobile' })
//   3. connectLocalMobileReader(reader, { locationId })
//   4. POST /api/stripe/terminal/payment-intent { invoice_id } → client_secret
//   5. retrievePaymentIntent(client_secret) → collectPaymentMethod → confirmPaymentIntent
//
// Backend marks invoice paid + fires review-request via the existing
// payment_intent.succeeded webhook (no extra wiring needed there).
//
// This file intentionally contains no runtime code yet — the package isn't
// installed, so importing the SDK would break the build. Remove this guard
// after the npm install lands.

export const TAP_TO_PAY_READY = false

export async function fetchConnectionToken(apiBase: string): Promise<string> {
  const res = await fetch(`${apiBase}/api/stripe/terminal/connection-token`, { method: 'POST' })
  if (!res.ok) throw new Error('Connection token failed')
  const { secret } = await res.json()
  return secret as string
}

export async function fetchTerminalPaymentIntent(apiBase: string, invoiceId: string, amount?: number) {
  const res = await fetch(`${apiBase}/api/stripe/terminal/payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoice_id: invoiceId, amount }),
  })
  if (!res.ok) throw new Error('PaymentIntent failed')
  return res.json() as Promise<{ client_secret: string; id: string; amount: number }>
}
