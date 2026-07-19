import type { WebsiteSection, WebsiteStyle } from '@/lib/website'
import * as Bold from './styles/bold'
import * as Editorial from './styles/editorial'
import * as Fresh from './styles/fresh'

type Company = { name: string; logo_url: string | null; email: string | null; phone: string | null }

// Each style module is a self-contained visual identity: Header, Footer,
// Section (the 7 section-type renderers), a page fontFamily, and — for
// styles whose form fields don't sit on a plain white/gray background —
// which <Contact/BookingForm> variant + submit-button class to use instead
// of the plain white-card default.
const STYLE_MODULES = {
  bold: { ...Bold, formVariant: 'light' as const, formButtonCls: undefined as string | undefined },
  editorial: { ...Editorial, formVariant: 'dark' as const, formButtonCls: Editorial.formButtonCls as string | undefined },
  fresh: { ...Fresh, formVariant: 'light' as const, formButtonCls: Fresh.formButtonCls as string | undefined },
}

export function getStyleModule(style: WebsiteStyle) {
  return STYLE_MODULES[style] ?? STYLE_MODULES.bold
}

export function SiteHeader({ style, company, primary }: { style: WebsiteStyle; company: Company; primary: string }) {
  const mod = getStyleModule(style)
  return <mod.Header company={company} primary={primary} />
}

export function SiteFooter({ style, company }: { style: WebsiteStyle; company: Company }) {
  const mod = getStyleModule(style)
  return <mod.Footer company={company} />
}

export function SectionBlock({
  style, section, primary, ContactForm, BookingForm,
}: {
  style: WebsiteStyle
  section: WebsiteSection
  primary: string
  ContactForm: React.ReactNode
  BookingForm: React.ReactNode
}) {
  const mod = getStyleModule(style)
  return <mod.Section section={section} primary={primary} ContactForm={ContactForm} BookingForm={BookingForm} />
}
