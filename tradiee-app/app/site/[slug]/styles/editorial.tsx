// "Premium Editorial" — moody, photography-led, restrained. Fixed dark umber
// base; light serif type; outline/ghost buttons; `primary` shows up only on
// small accents (links, button hover) so the neutral canvas stays intact.
import type { WebsiteSection } from '@/lib/website'

export const fontFamily = 'Georgia, "Times New Roman", serif'

const BG = '#241b14'
const BG_DEEP = '#1a130d'
const INK = '#f3ece2'

type Company = { name: string; logo_url: string | null; email: string | null; phone: string | null }

export function Header({ company }: { company: Company; primary: string }) {
  return (
    <header className="px-6 py-6" style={{ background: BG, color: INK }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        {company.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={company.logo_url} alt={company.name} className="h-8 w-auto brightness-0 invert" />
          : <span className="text-sm font-light uppercase tracking-[0.25em]">{company.name}</span>}
        {company.phone
          ? <a href={`tel:${company.phone}`} className="hidden text-xs uppercase tracking-widest text-white/70 hover:text-white sm:inline-block">{company.phone}</a>
          : <a href="#contact" className="text-xs uppercase tracking-widest text-white/70 hover:text-white">Enquire</a>}
      </div>
    </header>
  )
}

export function Footer({ company }: { company: Company }) {
  return (
    <footer className="px-6 py-12 text-center" style={{ background: BG_DEEP, color: 'rgba(243,236,226,0.5)' }}>
      <p className="text-xs uppercase tracking-[0.2em]">{company.name}</p>
      {company.email && <p className="mt-2 text-xs">{company.email}</p>}
      <p className="mt-4 text-[11px] opacity-60">© {new Date().getFullYear()}</p>
      <p className="mt-2 text-[11px] opacity-60">Powered by IndustryForms</p>
    </footer>
  )
}

const ghostBtn = 'inline-block border border-white/50 px-8 py-3 text-xs font-medium uppercase tracking-[0.2em] text-white transition-colors hover:border-white hover:bg-white/10'

export function Section({ section, primary, businessName, ContactForm, BookingForm }: {
  section: WebsiteSection; primary: string; businessName?: string; ContactForm: React.ReactNode; BookingForm: React.ReactNode
}) {
  switch (section.type) {
    case 'hero':
      return (
        <section
          className="relative px-6 py-32 text-center"
          style={section.imageUrl
            ? { background: `linear-gradient(rgba(20,14,10,0.5),rgba(20,14,10,0.5)), url(${section.imageUrl}) center/cover` }
            : { background: BG }}
        >
          <div className="mx-auto max-w-3xl" style={{ color: INK }}>
            <h1 className="text-4xl font-light tracking-wide md:text-6xl">{section.heading}</h1>
            {section.subheading && <p className="mx-auto mt-6 max-w-xl text-lg font-light text-white/70">{section.subheading}</p>}
            {section.ctaLabel && <a href="#contact" className={`mt-10 ${ghostBtn}`}>{section.ctaLabel}</a>}
          </div>
        </section>
      )

    case 'about':
      return (
        <section className="px-6 py-20" style={{ background: BG, color: INK }}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-6 text-2xl font-light tracking-wide md:text-3xl">{section.heading}</h2>
            <p className="whitespace-pre-wrap font-light leading-loose text-white/70">{section.body}</p>
          </div>
        </section>
      )

    case 'services': {
      const items = section.items.filter(i => i.title.trim())
      if (!items.length) return null
      return (
        <section style={{ background: BG, color: INK }}>
          <div className="border-y border-white/10 px-6 py-10 text-center">
            <h2 className="text-2xl font-light tracking-wide md:text-3xl">{section.heading}</h2>
          </div>
          <div className="mx-auto max-w-3xl divide-y divide-white/10 px-6">
            {items.map((it, i) => (
              <div key={i} className="flex flex-col gap-1 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <h3 className="text-lg font-light">{it.title}</h3>
                {it.description && <p className="text-sm font-light text-white/60 sm:max-w-md sm:text-right">{it.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )
    }

    case 'gallery': {
      if (!section.images.length) return null
      return (
        <section style={{ background: BG, color: INK }}>
          <div className="px-6 py-10 text-center">
            <h2 className="text-2xl font-light tracking-wide md:text-3xl">{section.heading}</h2>
          </div>
          <div className="grid grid-cols-2">
            {section.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`${businessName ?? section.heading} — recent work ${i + 1}`} loading="lazy" className="aspect-square w-full object-cover" />
            ))}
          </div>
        </section>
      )
    }

    case 'testimonials': {
      const items = section.items.filter(i => i.quote.trim())
      if (!items.length) return null
      return (
        <section className="px-6 py-20" style={{ background: BG, color: INK }}>
          <div className="mx-auto max-w-2xl space-y-12 text-center">
            <h2 className="text-2xl font-light tracking-wide md:text-3xl">{section.heading}</h2>
            {items.map((t, i) => (
              <figure key={i}>
                <blockquote className="text-xl font-light italic leading-relaxed text-white/85">&ldquo;{t.quote}&rdquo;</blockquote>
                {t.author && <figcaption className="mt-4 text-xs uppercase tracking-widest text-white/50">{t.author}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )
    }

    case 'contact':
      return (
        <section id="contact" className="px-6 py-20" style={{ background: BG }}>
          <div className="mx-auto max-w-xl">
            <h2 className="mb-8 text-center text-2xl font-light tracking-wide md:text-3xl" style={{ color: INK }}>{section.heading}</h2>
            {section.showForm ? ContactForm : null}
          </div>
        </section>
      )

    case 'booking':
      return (
        <section id="book" className="px-6 py-20" style={{ background: BG_DEEP }}>
          <div className="mx-auto max-w-xl">
            <h2 className="mb-2 text-center text-2xl font-light tracking-wide md:text-3xl" style={{ color: INK }}>{section.heading}</h2>
            {section.subheading && <p className="mb-8 text-center font-light text-white/60">{section.subheading}</p>}
            {BookingForm}
          </div>
        </section>
      )
  }
}

// Exposed so page.tsx can style the dark-variant form's submit button with
// this style's ghost-outline treatment instead of a solid `primary` fill.
export const formButtonCls = `w-full ${ghostBtn} disabled:opacity-60`
