// Shown above the signup/login form on a phone-sized screen. Pure CSS
// (`md:hidden`), not JS device/user-agent detection — the marketing site
// itself only ever links here (see index.html's own "Get the app" card,
// which already knows Android is live and iOS isn't), so viewport width is
// a perfectly reliable proxy for "this visitor is on a phone" and needs no
// client-side sniffing, no hydration mismatch risk, and works with SSR.
//
// Deliberately not a hard block or a redirect: initial company setup
// (price list, business settings) is a genuinely desktop-shaped task even
// for an owner who'll use the phone app day-to-day, and a hard block would
// cost real signups over device friction — contradicts this product's own
// "no pushy sales tactics" positioning (see PROJECT_BRIEF.md). It's
// information, not a gate.
export function MobileAppNudge() {
  return (
    <div className="md:hidden mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
      <p className="text-sm font-medium text-gray-900">On your phone?</p>
      <p className="text-xs text-gray-600 mt-0.5">
        This page is built for a bigger screen. For day-to-day job management on the go, get the Android app —
        you can still finish here if you&apos;d rather.
      </p>
      <a
        href="https://play.google.com/store/apps/details?id=com.industryforms"
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-orange-600 hover:text-orange-700"
      >
        Get it on Google Play →
      </a>
      <p className="text-[11px] text-gray-400 mt-1">iPhone app is coming soon — the web app works on any phone for now.</p>
    </div>
  )
}
