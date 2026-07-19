// "Bold & Direct" — high-contrast, CTA-heavy, built to convert. Fixed white/
// near-black base palette; `primary` drives the hero wash, phone pill and
// every button so the brand colour stays visible without breaking the look.
import type { WebsiteSection } from '@/lib/website'

export const fontFamily = 'system-ui, -apple-system, sans-serif'

type Company = { name: string; logo_url: string | null; email: string | null; phone: string | null }

export function Header({ company, primary }: { company: Company; primary: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-6 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="flex items-center gap-2.5">
          {company.logo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={company.logo_url} alt={company.name} className="h-8 w-auto" />
            : <span className="text-lg font-extrabold tracking-tight text-gray-900">{company.name}</span>}
        </div>
        <div className="flex items-center gap-2.5">
          {company.phone && (
            <a href={`tel:${company.phone}`} className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white sm:inline-block" style={{ background: primary }}>
              {company.phone}
            </a>
          )}
          <a href="#contact" className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
            Get a quote
          </a>
        </div>
      </div>
    </header>
  )
}

export function Footer({ company }: { company: Company }) {
  return (
    <footer className="border-t border-gray-100 bg-gray-950 px-6 py-10 text-center text-sm text-gray-400">
      <p className="font-semibold text-white">{company.name}</p>
      {company.email && <p className="mt-1">{company.email}</p>}
      <p className="mt-4 text-xs text-gray-600">© {new Date().getFullYear()} {company.name}</p>
      <p className="mt-3 text-xs text-gray-600">Powered by IndustryForms</p>
    </footer>
  )
}

export function Section({ section, primary, businessName, ContactForm, BookingForm }: {
  section: WebsiteSection; primary: string; businessName?: string; ContactForm: React.ReactNode; BookingForm: React.ReactNode
}) {
  switch (section.type) {
    case 'hero':
      return (
        <section
          className="relative px-6 py-24 text-center"
          style={section.imageUrl
            ? { background: `linear-gradient(rgba(255,255,255,0.55),rgba(255,255,255,0.9)), url(${section.imageUrl}) center/cover` }
            : { background: `linear-gradient(180deg, color-mix(in srgb, ${primary} 55%, white) 0%, color-mix(in srgb, ${primary} 12%, white) 55%, #ffffff 100%)` }}
        >
          <div className="mx-auto max-w-3xl">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 md:text-6xl">{section.heading}</h1>
            {section.subheading && <p className="mx-auto mt-5 max-w-xl text-lg text-gray-600 md:text-xl">{section.subheading}</p>}
            {section.ctaLabel && (
              <a href="#contact" className="mt-8 inline-block rounded-full bg-gray-900 px-8 py-3.5 font-semibold text-white hover:bg-gray-800">
                {section.ctaLabel}
              </a>
            )}
          </div>
        </section>
      )

    case 'about':
      return (
        <section className="px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-4 text-2xl font-extrabold text-gray-900 md:text-3xl">{section.heading}</h2>
            <p className="whitespace-pre-wrap leading-relaxed text-gray-600">{section.body}</p>
          </div>
        </section>
      )

    case 'services': {
      const items = section.items.filter(i => i.title.trim())
      if (!items.length) return null
      return (
        <section className="bg-gray-50 px-6 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-8 text-2xl font-extrabold text-gray-900 md:text-3xl">{section.heading}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it, i) => (
                <div key={i} className="rounded-xl border-2 border-gray-900 bg-white p-6">
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: primary }}>
                    {i + 1}
                  </div>
                  <h3 className="mb-1.5 font-bold text-gray-900">{it.title}</h3>
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
        <section className="px-6 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-8 text-2xl font-extrabold text-gray-900 md:text-3xl">{section.heading}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {section.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`${businessName ?? section.heading} — recent work ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
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
        <section className="bg-gray-50 px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-2xl font-extrabold text-gray-900 md:text-3xl">{section.heading}</h2>
            <div className="space-y-5">
              {items.map((t, i) => (
                <figure key={i} className="rounded-xl border-2 border-gray-900 bg-white p-6">
                  <blockquote className="text-gray-700">&ldquo;{t.quote}&rdquo;</blockquote>
                  {t.author && <figcaption className="mt-3 text-sm font-bold text-gray-900">— {t.author}</figcaption>}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )
    }

    case 'contact':
      return (
        <section id="contact" className="px-6 py-16">
          <div className="mx-auto max-w-xl rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
            <h2 className="mb-6 text-2xl font-extrabold text-gray-900 md:text-3xl">{section.heading}</h2>
            {section.showForm ? ContactForm : null}
          </div>
        </section>
      )

    case 'booking':
      return (
        <section id="book" className="bg-gray-50 px-6 py-16">
          <div className="mx-auto max-w-xl rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
            <h2 className="mb-2 text-2xl font-extrabold text-gray-900 md:text-3xl">{section.heading}</h2>
            {section.subheading && <p className="mb-6 text-gray-500">{section.subheading}</p>}
            {BookingForm}
          </div>
        </section>
      )
  }
}
