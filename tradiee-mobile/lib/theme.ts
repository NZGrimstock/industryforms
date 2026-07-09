// Design tokens — formalises the palette/radius/shadow already used across
// the app (see IndustryForms_Mobile_Overhaul_Brief.docx §5). No rebrand:
// this just gives new screens (Inbox, ETA) a single source instead of
// copy-pasting hex values.

export const colors = {
  brand: '#f97316',
  brandDark: '#ea580c',
  brandBg: '#fff7ed',
  brandBorder: '#fed7aa',
  success: '#22c55e',
  successBg: '#dcfce7',
  info: '#3b82f6',
  infoBg: '#dbeafe',
  warn: '#eab308',
  danger: '#ef4444',
  dangerBg: '#fee2e2',
  purple: '#8b5cf6',
  purpleBg: '#ede9fe',
  ink: '#111827',
  sub: '#6b7280',
  mut: '#9ca3af',
  line: '#e5e7eb',
  surface: '#ffffff',
  bg: '#f9fafb',
} as const

export const radius = { sm: 8, md: 12, lg: 14, xl: 16 } as const

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
} as const
