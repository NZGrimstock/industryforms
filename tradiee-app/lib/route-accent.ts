// Per-route accent palette. Buttons and other accent-aware components read
// the resulting CSS variables (--accent, --accent-hover, --accent-soft,
// --accent-soft-text, --accent-ring) from the dashboard shell. The global
// "+ New" button and the brand chrome stay orange regardless.

export type Accent = {
  solid: string       // primary button background
  solidHover: string  // hover state
  soft: string        // chip/badge background
  softText: string    // chip/badge text
  ring: string        // focus ring colour
}

// Hex values picked to read clearly on white at AA contrast.
const ORANGE: Accent = {
  solid: '#f97316', solidHover: '#ea580c',
  soft: '#fff7ed',  softText: '#c2410c', ring: '#f97316',
}
const SKY_EMERALD: Accent = { // Customers & Jobs + Projects + Dashboard cluster
  solid: '#0284c7', solidHover: '#0369a1',
  soft: '#ecfeff',  softText: '#0e7490', ring: '#0284c7',
}
const AMBER_ROSE: Accent = {  // Suppliers & Orders
  solid: '#f97316', solidHover: '#ea580c',
  soft: '#fff7ed',  softText: '#9a3412', ring: '#f97316',
}
const VIOLET_PINK: Accent = { // Admin
  solid: '#7c3aed', solidHover: '#6d28d9',
  soft: '#f5f3ff',  softText: '#6d28d9', ring: '#7c3aed',
}

// First-segment → accent. Anything unmapped (e.g. /dashboard, /upgrade) falls
// back to orange so the brand colour still shows up where there's no group.
const MAP: Record<string, Accent> = {
  enquiries:   SKY_EMERALD,
  customers:   SKY_EMERALD,
  quotes:      SKY_EMERALD,
  projects:    SKY_EMERALD,
  jobs:        SKY_EMERALD,
  schedule:    SKY_EMERALD,
  timesheets:  SKY_EMERALD,
  invoices:    SKY_EMERALD,
  forms:       SKY_EMERALD,
  todos:       SKY_EMERALD,

  'purchase-orders': AMBER_ROSE,
  bills:             AMBER_ROSE,
  suppliers:         AMBER_ROSE,
  'price-list':      AMBER_ROSE,

  reports:  VIOLET_PINK,
  website:  VIOLET_PINK,
  settings: VIOLET_PINK,
}

export function accentForPath(pathname: string | null | undefined): Accent {
  const seg = (pathname ?? '/').split('/').filter(Boolean)[0]
  return (seg && MAP[seg]) || ORANGE
}

// True iff the first path segment has an explicit route accent (i.e. not the
// orange fallback). The shell uses this to decide whether the company brand
// accent should override the orange fallback.
export function hasRouteAccent(pathname: string | null | undefined): boolean {
  const seg = (pathname ?? '/').split('/').filter(Boolean)[0]
  return !!(seg && MAP[seg])
}
