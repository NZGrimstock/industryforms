// Signup abuse guard. On 30 Sep–1 Oct 2026 a bot created ~155k trial accounts
// whose "full name" was a gambling ad with a bit.ly link. The day-0 welcome
// email opens "Hi {name}," — so every fake signup made us email the ad, from
// our own domain, to a real third-party inbox ("subscription bombing").
// Pure functions (no imports) so scripts/check-signup-guard.mjs can test them.

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ly|me|co|info|xyz|top|ru|tr|bet|click|link|site|online)(\/|\b)|bit\.ly|t\.me\/)/i

/** True when text looks like it carries a link — never legitimate in a person's or business's name. */
export function containsLink(text: string | null | undefined): boolean {
  return !!text && LINK.test(text)
}

export const MAX_NAME = 80
export const MAX_COMPANY = 120

/** Returns a user-facing error for spammy/oversized name fields, or null when OK. */
export function signupTextError(fullName: string, companyName: string): string | null {
  if (fullName.length > MAX_NAME) return 'Name is too long'
  if (companyName.length > MAX_COMPANY) return 'Business name is too long'
  if (containsLink(fullName) || containsLink(companyName)) return 'Names can’t contain web links'
  return null
}

/** More than this many new companies in the window looks like a bot run, not real trials. */
export const BURST_WINDOW_MINUTES = 10
export const BURST_MAX_SIGNUPS = 15

/** Escape text for interpolation into an HTML email. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
