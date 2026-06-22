import type { WebsiteSection } from '@/lib/website'

// Server-rendered section blocks for the public site. `primary` is the theme
// colour; interactive contact form is a separate client component.
export function SectionBlock({
  section,
  primary,
  ContactForm,
  BookingForm,
}: {
  section: WebsiteSection
  primary: string
  ContactForm: React.ReactNode
  BookingForm: React.ReactNode
}) {
  switch (section.type) {
    case 'hero':
      return (
        <section
          className="px-6 py-20 text-center text-white relative"
          style={{ background: section.imageUrl ? `linear-gradient(rgba(17,24,39,0.55),rgba(17,24,39,0.55)), url(${section.imageUrl}) center/cover` : primary }}
        >
          <div className="max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-extrabold mb-4">{section.heading}</h1>
            {section.subheading && <p className="text-lg md:text-xl text-white/90 mb-8">{section.subheading}</p>}
            {section.ctaLabel && (
              <a
                href="#contact"
                className="inline-block rounded-full bg-white px-7 py-3 font-semibold shadow-sm"
                style={{ color: primary }}
              >
                {section.ctaLabel}
              </a>
            )}
          </div>
        </section>
      )

    case 'about':
      return (
        <section className="px-6 py-16">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">{section.heading}</h2>
            <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{section.body}</p>
          </div>
        </section>
      )

    case 'services': {
      const items = section.items.filter(i => i.title.trim())
      if (!items.length) return null
      return (
        <section className="px-6 py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">{section.heading}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((it, i) => (
                <div key={i} className="rounded-xl bg-white p-6 border border-gray-100 shadow-sm">
                  <div className="w-10 h-1.5 rounded-full mb-4" style={{ background: primary }} />
                  <h3 className="font-semibold text-gray-900 mb-1.5">{it.title}</h3>
                  {it.description && <p className="text-sm text-gray-500 leading-relaxed">{it.description}</p>}
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
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">{section.heading}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {section.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="w-full aspect-square object-cover rounded-xl" />
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
        <section className="px-6 py-16 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">{section.heading}</h2>
            <div className="space-y-5">
              {items.map((t, i) => (
                <figure key={i} className="rounded-xl bg-white p-6 border border-gray-100 shadow-sm">
                  <blockquote className="text-gray-700 italic">“{t.quote}”</blockquote>
                  {t.author && <figcaption className="mt-3 text-sm font-semibold text-gray-500">— {t.author}</figcaption>}
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
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">{section.heading}</h2>
            {section.showForm ? ContactForm : null}
          </div>
        </section>
      )

    case 'booking':
      return (
        <section id="book" className="px-6 py-16 bg-gray-50">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 text-center">{section.heading}</h2>
            {section.subheading && <p className="text-center text-gray-500 mb-6">{section.subheading}</p>}
            {BookingForm}
          </div>
        </section>
      )
  }
}
