// "Fresh & Organic" — light, natural, two-tone sage + lime. Fixed sage base
// and a fixed lime accent block (the style's signature move); `primary`
// drives buttons, links and small icon chips so the brand colour still shows.
import type { WebsiteSection } from '@/lib/website'

export const fontFamily = 'system-ui, -apple-system, sans-serif'

const SAGE = '#eef2ea'
const SAGE_DEEP = '#e3ead9'
const FOREST = '#233420'
const LIME = '#ccf17a'

type Company = { name: string; logo_url: string | null; email: string | null; phone: string | null }

export function Header({ company }: { company: Company; primary: string }) {
  return (
    <header className="px-6 py-5" style={{ background: SAGE }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        {company.logo_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={company.logo_url} alt={company.name} className="h-9 w-auto" />
          : <span className="text-lg font-bold" style={{ color: FOREST }}>{company.name}</span>}
        <a
          href="#contact"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-transform hover:scale-105"
          style={{ background: FOREST }}
          aria-label="Get in touch"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </a>
      </div>
    </header>
  )
}

export function Footer({ company }: { company: Company }) {
  return (
    <footer className="px-6 py-10 text-center" style={{ background: SAGE_DEEP, color: FOREST }}>
      <p className="font-semibold">{company.name}</p>
      {company.email && <p className="mt-1 text-sm opacity-70">{company.email}</p>}
      <p className="mt-3 text-xs opacity-50">© {new Date().getFullYear()}</p>
      <p className="mt-1 text-xs opacity-50">Powered by IndustryForms</p>
    </footer>
  )
}

export function Section({ section, primary, ContactForm, BookingForm }: {
  section: WebsiteSection; primary: string; ContactForm: React.ReactNode; BookingForm: React.ReactNode
}) {
  switch (section.type) {
    case 'hero':
      return (
        <section className="px-6 pb-16 pt-10" style={{ background: SAGE }}>
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: primary }}>Welcome</p>
            <h1 className="mt-2 text-3xl font-bold md:text-5xl" style={{ color: FOREST }}>{section.heading}</h1>
            {section.subheading && <p className="mt-4 max-w-xl text-base leading-relaxed opacity-70" style={{ color: FOREST }}>{section.subheading}</p>}
            {section.ctaLabel && (
              <a href="#contact" className="mt-7 inline-block rounded-full px-7 py-3 font-semibold text-white" style={{ background: primary }}>
                {section.ctaLabel}
              </a>
            )}
          </div>
          {section.imageUrl && (
            <div className="mx-auto mt-10 max-w-4xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={section.imageUrl} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" />
            </div>
          )}
        </section>
      )

    case 'about':
      return (
        <section className="px-6 py-16" style={{ background: SAGE }}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-2xl font-bold md:text-3xl" style={{ color: FOREST }}>{section.heading}</h2>
            <p className="whitespace-pre-wrap leading-relaxed opacity-70" style={{ color: FOREST }}>{section.body}</p>
          </div>
        </section>
      )

    case 'services': {
      const items = section.items.filter(i => i.title.trim())
      if (!items.length) return null
      return (
        <section className="px-6 py-16" style={{ background: SAGE_DEEP }}>
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl" style={{ color: FOREST }}>{section.heading}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it, i) => (
                <div key={i} className="rounded-2xl bg-white p-6 shadow-sm">
                  <div className="mb-4 h-9 w-9 rounded-full" style={{ background: primary }} />
                  <h3 className="mb-1.5 font-semibold" style={{ color: FOREST }}>{it.title}</h3>
                  {it.description && <p className="text-sm leading-relaxed text-gray-500">{it.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )
    }

    case 'gallery': {
      if (!section.images.length) return null
      return (
        <section className="px-6 py-16" style={{ background: SAGE }}>
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl" style={{ color: FOREST }}>{section.heading}</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {section.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="aspect-square w-full rounded-2xl object-cover" />
              ))}
            </div>
          </div>
        </section>
      )
    }

    case 'testimonials': {
      const items = section.items.filter(i => i.quote.trim())
      if (!items.length) return null
      return (
        <section className="px-6 py-16" style={{ background: SAGE_DEEP }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-center text-2xl font-bold md:text-3xl" style={{ color: FOREST }}>{section.heading}</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {items.map((t, i) => (
                <figure key={i} className="rounded-2xl bg-white p-6 shadow-sm">
                  <blockquote className="text-gray-700">&ldquo;{t.quote}&rdquo;</blockquote>
                  {t.author && <figcaption className="mt-3 text-sm font-semibold" style={{ color: FOREST }}>— {t.author}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )
    }

    case 'contact':
      return (
        <section id="contact" className="px-6 py-16" style={{ background: SAGE }}>
          <div className="mx-auto max-w-xl rounded-2xl p-8" style={{ background: LIME }}>
            <h2 className="mb-6 text-center text-2xl font-bold md:text-3xl" style={{ color: FOREST }}>{section.heading}</h2>
            {section.showForm ? ContactForm : null}
          </div>
        </section>
      )

    case 'booking':
      return (
        <section id="book" className="px-6 py-16" style={{ background: SAGE_DEEP }}>
          <div className="mx-auto max-w-xl rounded-2xl p-8" style={{ background: LIME }}>
            <h2 className="mb-2 text-center text-2xl font-bold md:text-3xl" style={{ color: FOREST }}>{section.heading}</h2>
            {section.subheading && <p className="mb-6 text-center opacity-70" style={{ color: FOREST }}>{section.subheading}</p>}
            {BookingForm}
          </div>
        </section>
      )
  }
}

// Both forms sit on a solid LIME block — the plain "light" input variant
// (bordered, dark text) reads fine against it, so no special variant needed.
// The submit button is fixed forest-green (not `primary`) since it sits on
// lime and needs guaranteed contrast regardless of the brand colour chosen.
export const formButtonCls = 'w-full rounded-lg bg-[#233420] py-3 font-semibold text-white hover:opacity-90 disabled:opacity-60'
