// Shared model for the Instant Website builder.
// Sections are stored as an ordered JSONB array on company_websites.sections.

export type HeroSection = {
  type: 'hero'
  heading: string
  subheading: string
  ctaLabel: string
  imageUrl?: string
}
export type AboutSection = {
  type: 'about'
  heading: string
  body: string
}
export type ServicesSection = {
  type: 'services'
  heading: string
  items: { title: string; description: string }[]
}
export type GallerySection = {
  type: 'gallery'
  heading: string
  images: string[] // absolute URLs (job photos live in the public R2 bucket)
}
export type TestimonialsSection = {
  type: 'testimonials'
  heading: string
  items: { quote: string; author: string }[]
}
export type ContactSection = {
  type: 'contact'
  heading: string
  showForm: boolean
}
export type BookingSection = {
  type: 'booking'
  heading: string
  subheading?: string
  ctaLabel?: string
}

export type WebsiteSection =
  | HeroSection
  | AboutSection
  | ServicesSection
  | GallerySection
  | TestimonialsSection
  | ContactSection
  | BookingSection

export type WebsiteSectionType = WebsiteSection['type']

// A "style" is a complete, art-directed visual identity (typography, layout,
// button shape, base palette) — not just a colour swap. `primary` is still the
// one thing a company can customise within whichever style they pick: it
// drives buttons/links/small accents, while the style's base palette (e.g.
// editorial's umber, fresh's sage) stays fixed so the look stays coherent no
// matter what colour a tradie's logo happens to be.
export type WebsiteStyle = 'bold' | 'editorial' | 'fresh'

export const WEBSITE_STYLES: { key: WebsiteStyle; label: string; blurb: string; swatch: [string, string, string] }[] = [
  { key: 'bold', label: 'Bold & Direct', blurb: 'High-contrast and CTA-heavy — built to turn visits into quote requests.', swatch: ['#0f172a', '#bfdbfe', '#111827'] },
  { key: 'editorial', label: 'Premium Editorial', blurb: 'Moody and photography-led — for high-end residential and renovation work.', swatch: ['#2b2118', '#f3ece2', '#c9a876'] },
  { key: 'fresh', label: 'Fresh & Organic', blurb: 'Light, natural tones — a fit for landscaping and outdoor trades.', swatch: ['#e8ede1', '#2f4a2c', '#d9f2b4'] },
]

export type WebsiteTheme = {
  primary: string
  font: 'sans' | 'serif'
  style: WebsiteStyle
}

export const SECTION_LABELS: Record<WebsiteSectionType, string> = {
  hero: 'Hero',
  about: 'About',
  services: 'Services',
  gallery: 'Photo gallery',
  testimonials: 'Testimonials',
  contact: 'Contact',
  booking: 'Book a visit',
}

export const DEFAULT_THEME: WebsiteTheme = { primary: '#f97316', font: 'sans', style: 'bold' }

// A blank section of a given type, used when the user adds one in the editor.
export function blankSection(type: WebsiteSectionType): WebsiteSection {
  switch (type) {
    case 'hero':
      return { type, heading: '', subheading: '', ctaLabel: 'Get a free quote' }
    case 'about':
      return { type, heading: 'About us', body: '' }
    case 'services':
      return { type, heading: 'What we do', items: [{ title: '', description: '' }] }
    case 'gallery':
      return { type, heading: 'Our work', images: [] }
    case 'testimonials':
      return { type, heading: 'What customers say', items: [{ quote: '', author: '' }] }
    case 'contact':
      return { type, heading: 'Get in touch', showForm: true }
    case 'booking':
      return { type, heading: 'Book a visit', subheading: "Pick a time that suits — we'll confirm by phone or email.", ctaLabel: 'Request booking' }
  }
}

// Sensible starting site auto-filled from the company profile.
export function defaultSections(company: {
  name: string
  trade_type?: string | null
  address?: string | null
}): WebsiteSection[] {
  const trade = company.trade_type?.trim() || 'trade services'
  const area = company.address?.split(',').slice(-2).join(',').trim()
  return [
    {
      type: 'hero',
      heading: company.name,
      subheading: `Trusted ${trade}${area ? ` serving ${area}` : ''}.`,
      ctaLabel: 'Get a free quote',
    },
    {
      type: 'about',
      heading: 'About us',
      body: `${company.name} provides reliable ${trade}. Get in touch for a no-obligation quote.`,
    },
    { type: 'services', heading: 'What we do', items: [{ title: '', description: '' }] },
    { type: 'contact', heading: 'Get in touch', showForm: true },
  ]
}

// Slugify a company name into a URL-safe site slug.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'site'
}
