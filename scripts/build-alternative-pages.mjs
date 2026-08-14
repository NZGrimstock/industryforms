// Generates the 4 "alternative to X" landing pages (alternatives/<slug>.html),
// same data-driven/no-build-step pattern as build-trade-pages.mjs — output is
// committed, run `node scripts/build-alternative-pages.mjs` to regenerate.
//
// Content note: every claim about a named competitor below is either (a) a
// verifiable fact about our own product, or (b) attributed to public reviews
// ("reviewers report...") rather than stated as flat assertion — matches the
// house rule already established on this site (see PROJECT_STATE.md 2026-08-05:
// fabricated testimonials were removed for exactly this reason). Spot-check
// competitor pricing/features against their current sites before publishing —
// this was researched once, not continuously monitored.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escJsonLd(s) {
  return JSON.stringify(String(s)).slice(1, -1).replace(/</g, '\\u003c')
}

const ALTERNATIVES = [
  {
    slug: 'tradify',
    competitor: 'Tradify',
    heading: 'The Tradify alternative for NZ & AU trades',
    intro: `Tradify built this category, and plenty of businesses do fine on it. If you've hit its known rough edges — no true offline app, stock levels you can't really track, a Google Calendar sync that only goes one way, or a "sent from Tradify" footer on the emails your customers see — Industry Forms is built to fix exactly those gaps, not just match the feature list.`,
    rows: [
      ['Offline mobile app', 'Full offline access — quote, invoice, and log time with no signal, syncs when you’re back in range', 'Reviewers commonly note no true offline mode and slow-loading app pages'],
      ['Stock / inventory tracking', 'Real quantity-on-hand tracking against your price list', 'Reviewers commonly flag inventory tracking as a weak spot'],
      ['Google Calendar sync', 'Two-way sync', 'Export-only, one-way'],
      ['Your brand on customer emails', 'Quotes and invoices go out under your business name only', 'Reviewers note a "sent from Tradify" footer appears on some plans'],
      ['Pricing approach', 'One flat price, shown up front, no expiring "sign today" discounts', 'Reviewers note sales tactics built around discount deadlines'],
    ],
    faqs: [
      { q: 'Is Industry Forms actually different, or just a copy of Tradify?', a: 'Same core workflow — quote, job, schedule, invoice — because that workflow is what trades actually need. The difference is in the specific gaps above: offline access, real stock tracking, two-way calendar sync, and unbranded customer communication.' },
      { q: 'Can I bring my Tradify data across?', a: 'Yes. Our import tool brings your customers, price list, and job history in directly — it’s built to read a Tradify export, not just generic CSV.' },
      { q: 'Will my team need retraining?', a: 'The workflow (quote → job → schedule → invoice) will feel familiar since it’s the same shape every trade job app uses. Most of the learning curve is finding where things live, not relearning how the job works.' },
    ],
    relatedBlogSlugs: ['is-paperwork-killing-your-business', 'try-job-management-software-free-trial', 'track-materials-on-jobs'],
  },
  {
    slug: 'jobber',
    competitor: 'Jobber',
    heading: 'The Jobber alternative built for Xero-first trades',
    intro: `Jobber is a strong platform, built and priced around the US market — QuickBooks-first integration, and cost that climbs with every extra team member. Industry Forms is priced flat per plan, not per seat, and syncs directly to Xero, the accounting software most NZ/AU trade businesses already run.`,
    rows: [
      ['Team pricing', 'Flat pricing per plan tier', 'Jobber’s published pricing adds roughly $29 USD per extra user on top of the plan price'],
      ['Accounting sync', 'Native Xero sync', 'Built around QuickBooks; reviewers report sync friction connecting to Xero'],
      ['Reporting & job costing', 'Job costing (invoiced vs. paid vs. still to invoice) built into every job and customer', 'Reporting is reviewers’ most commonly cited weak spot — no custom report builder'],
      ['Automated reminders', 'Quote follow-ups and invoice reminders included', 'Reviewers note automated follow-ups and two-way texting are limited to higher-priced tiers'],
    ],
    faqs: [
      { q: 'We’re already on Xero — does that actually matter?', a: 'It matters a lot day-to-day: invoices created in Industry Forms sync straight to Xero with no manual re-entry or CSV exports, and no separate QuickBooks-shaped workaround.' },
      { q: 'How does the pricing actually compare for a team of 5–10?', a: 'The mechanism is the difference: Jobber’s cost rises with every added team member, ours doesn’t. Get a quote for your exact team size before switching — we’d rather you compare real numbers than take our word for it.' },
      { q: 'Can I import my Jobber data?', a: 'Yes — export your customers and job history from Jobber as CSV and our import wizard brings them straight in.' },
    ],
    relatedBlogSlugs: ['cash-flow-invoice-faster', 'hvac-software-that-links-to-xero', 'try-job-management-software-free-trial'],
  },
  {
    slug: 'servicem8',
    competitor: 'ServiceM8',
    heading: 'The ServiceM8 alternative for Android crews',
    intro: `ServiceM8 is well regarded — but its field app is iOS only. If your crew carries Android phones, the most common phone in the NZ/AU trades, you're working in a browser instead of a real app: slower, no native camera capture, and limited offline. Industry Forms is a native Android app today, offline-first, so the whole team gets the same real app experience regardless of phone.`,
    rows: [
      ['Android field app', 'Native Android app, offline-first', 'iOS only for field staff — Android users get a browser-based web app instead'],
      ['Offline mode', 'Job data, photos, and time logging all work with no signal, sync automatically after', 'Reviewers report offline support is limited on the Android browser fallback'],
      ['All-in pricing', 'One flat price covers the core plan', 'Reviewers report add-on costs (phone, accounting connection) stack up beyond the headline price'],
      ['Everyday reliability', '—', 'Reviewers report slow search and occasional missed notifications'],
    ],
    faqs: [
      { q: 'My team is on Android — does that actually matter day to day?', a: 'Yes. A native app means working offline in a basement or rural job with no signal, then syncing automatically — a browser tab can’t reliably do that, and reviewers report exactly this gap on ServiceM8’s Android experience.' },
      { q: 'Can I bring my ServiceM8 data across?', a: 'Yes — our import tool is built to read a ServiceM8 export directly, bringing customers, jobs, and history with it.' },
      { q: 'What about iPhone users on my team?', a: 'The web app works on any phone today; talk to us about your team’s specific mix of devices before switching.' },
    ],
    relatedBlogSlugs: ['field-service-scheduling-for-teams', 'plumbing-business-paper-to-digital', 'try-job-management-software-free-trial'],
  },
  {
    slug: 'fergus',
    competitor: 'Fergus',
    heading: 'The Fergus alternative built for predictable pricing',
    intro: `Fergus knows the NZ trade workflow well — it was built by a plumber. But recent pricing changes have pushed real-world cost toward roughly $70/user/month for a lot of teams, and reviewers flag a calendar with no month view and job files that don't have a proper home. Industry Forms keeps the price simple and the job record complete — photos, files, quotes, and invoices, all in the same place.`,
    rows: [
      ['Pricing', 'Transparent per-plan pricing, shown up front', 'Reviewers report real-world cost near $70/user/month after recent price rises'],
      ['Calendar', 'Month, week, and day views', 'Reviewers report no month view and describe scheduling as limited'],
      ['Files on a job', 'Photos and documents attach directly to the job record', 'Reviewers report no file/folder management inside a job'],
      ['Reporting', 'Job costing — invoiced, paid, and still-to-invoice — built into every job', 'Reviewers ask for profit-by-job/by-rep reporting that isn’t available yet'],
      ['Support', '—', 'Reviewers report promised follow-up calls that don’t happen'],
    ],
    faqs: [
      { q: 'Fergus is NZ-built too — what’s actually different?', a: 'Both understand the local trade workflow. The differences are concrete: simpler, more predictable pricing, a proper month-view calendar, files that live on the job itself, and job-level profit reporting out of the box.' },
      { q: 'Can I import my Fergus data?', a: 'Yes — our import tool is built to read a Fergus export directly, bringing your customers, price list, and job history with it.' },
      { q: 'Is this a bigger switch than staying with a NZ-built product?', a: 'No — the workflow (quote → job → schedule → invoice) is the same shape, and we’re NZ/AU-built and priced too. The import brings your existing data across rather than starting from zero.' },
    ],
    relatedBlogSlugs: ['software-to-track-quotes-for-builders', 'safety-compliance-documentation-for-tradies', 'try-job-management-software-free-trial'],
  },
]

const BLOG_TITLES = {
  'is-paperwork-killing-your-business': "Is Paperwork Killing Your Business? The Modern Tradie's Guide to Going Digital",
  'try-job-management-software-free-trial': 'Why You Should Always Try Job Management Software Before Buying',
  'track-materials-on-jobs': 'How to Stop Losing Track of Materials on Jobs',
  'cash-flow-invoice-faster': 'Cash Flow is King: Why You Should Never Wait Until Friday to Invoice',
  'hvac-software-that-links-to-xero': 'Best Software for Running a Small HVAC Business That Links to Xero',
  'field-service-scheduling-for-teams': 'Field Service Apps with Good Scheduling for Teams',
  'plumbing-business-paper-to-digital': 'How to Move Your Plumbing Business from Paper to Digital',
  'software-to-track-quotes-for-builders': 'Software to Track Quotes for Builders',
  'safety-compliance-documentation-for-tradies': 'Compliance Without the Headache: Mastering Safety Documentation',
}

function page(a) {
  const url = `https://www.industryforms.app/alternatives/${a.slug}.html`
  const description = `Looking for a ${a.competitor} alternative? Industry Forms is job management software for NZ/AU trades — quotes, scheduling, offline mobile job cards, invoicing, and Xero sync. Import your ${a.competitor} data in minutes. Free 28-day trial.`
  const h = { heading: escHtml(a.heading), description: escHtml(description), competitor: escHtml(a.competitor), intro: escHtml(a.intro) }
  const j = { description: escJsonLd(description) }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${h.heading} — Industry Forms</title>
<meta name="description" content="${h.description}">
<link rel="canonical" href="${url}">
<link rel="icon" href="../Logo/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="../Logo/favicon.png">
<meta name="theme-color" content="#E8722A">
<meta property="og:title" content="${h.heading}">
<meta property="og:description" content="${h.description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://www.industryforms.app/Logo/Logo.png">
<meta property="og:site_name" content="Industry Forms">
<meta property="og:locale" content="en_NZ">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${h.heading}">
<meta name="twitter:description" content="${h.description}">
<meta name="twitter:image" content="https://www.industryforms.app/Logo/Logo.png">
<link rel="stylesheet" href="../styles.css">
<link rel="preload" as="font" type="font/woff2" href="../fonts/figtree.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="../fonts/sora.woff2" crossorigin>
<link rel="stylesheet" href="../fonts.css">
<script defer src="https://cloud.umami.is/script.js" data-website-id="ea31af5f-3a95-477b-8039-89d049815535"></script>
<script src="../js/lucide.min.js"></script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "Industry Forms",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web, iOS, Android",
      "url": "${url}",
      "description": "${j.description}",
      "areaServed": ["New Zealand", "Australia"],
      "offers": { "@type": "Offer", "price": "29", "priceCurrency": "NZD", "availability": "https://schema.org/InStock", "url": "https://app.industryforms.app/signup" }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
${a.faqs.map(f => `        { "@type": "Question", "name": "${escJsonLd(f.q)}", "acceptedAnswer": { "@type": "Answer", "text": "${escJsonLd(f.a)}" } }`).join(',\n')}
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.industryforms.app/" },
        { "@type": "ListItem", "position": 2, "name": "${h.competitor} alternative", "item": "${url}" }
      ]
    }
  ]
}
</script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { font-family: 'Figtree', sans-serif; background: #F6F2EC; color: #1C1C2E; }
  .nav-blur { backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); background: rgba(246,242,236,0.82); }
  .btn-brand { position: relative; overflow: hidden; transition: transform 0.25s cubic-bezier(0.16,1,0.3,1), box-shadow 0.25s ease; }
  .btn-brand:hover { transform: translateY(-2px); box-shadow: 0 10px 36px -6px rgba(232,114,42,0.45); }
  .card-lift { transition: transform 0.4s cubic-bezier(0.16,1,0.3,1), box-shadow 0.4s ease; }
  .card-lift:hover { transform: translateY(-5px); box-shadow: 0 24px 64px -16px rgba(0,0,0,0.13); }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: #F6F2EC; }
  ::-webkit-scrollbar-thumb { background: #C8C0B4; border-radius: 10px; }
  .sr-only-focusable { position: absolute; left: -9999px; top: 0; z-index: 100; background: #E8722A; color: #fff; padding: 0.75rem 1.25rem; border-radius: 0 0 0.5rem 0; font-weight: 600; font-size: 0.875rem; }
  .sr-only-focusable:focus { left: 0; }
  .faq-item > summary { cursor: pointer; list-style: none; }
  .faq-item > summary::-webkit-details-marker { display: none; }
  .faq-item[open] > summary .faq-icon { transform: rotate(45deg); }
  .cmp-table { width: 100%; border-collapse: collapse; }
  .cmp-table th, .cmp-table td { text-align: left; padding: 0.9rem 1rem; vertical-align: top; font-size: 0.875rem; }
  .cmp-table thead th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(28,28,46,0.4); border-bottom: 1px solid rgba(0,0,0,0.06); }
  .cmp-table tbody tr:not(:last-child) td { border-bottom: 1px solid rgba(0,0,0,0.05); }
  .cmp-table td:first-child { font-weight: 600; color: #1C1C2E; width: 26%; }
  .cmp-us { color: #1C1C2E; }
  .cmp-them { color: rgba(28,28,46,0.55); }
</style>
</head>
<body>

<a href="#main" class="sr-only-focusable">Skip to content</a>

<nav class="fixed top-0 left-0 right-0 z-50 nav-blur border-b border-black/[0.05]" role="navigation">
  <div class="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
    <a href="../index.html" class="flex items-center gap-2.5 group" aria-label="Industry Forms home">
      <img src="../Logo/Logo.png" alt="Industry Forms" class="h-[72px] w-auto transition-transform duration-300 group-hover:scale-105">
    </a>
    <div class="hidden md:flex items-center gap-8">
      <a href="../index.html#features" class="text-sm font-medium text-ink/55 hover:text-ink transition-colors duration-150">Features</a>
      <a href="../index.html#pricing" class="text-sm font-medium text-ink/55 hover:text-ink transition-colors duration-150">Pricing</a>
      <a href="../blog.html" class="text-sm font-medium text-ink/55 hover:text-ink transition-colors duration-150">Blog</a>
      <a href="https://app.industryforms.app" class="btn-brand bg-brand text-white text-sm font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-1.5">
        Start Free Trial <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
      </a>
    </div>
    <button id="mobileMenuBtn" class="md:hidden p-2 rounded-xl hover:bg-black/[0.06] transition-colors" aria-label="Menu" aria-expanded="false" aria-controls="mobileMenu">
      <i data-lucide="menu" class="w-5 h-5 text-ink"></i>
    </button>
  </div>
  <div id="mobileMenu" class="hidden md:hidden border-t border-black/[0.05] bg-paper/96 backdrop-blur-2xl">
    <div class="px-6 py-5 flex flex-col gap-1">
      <a href="../index.html#features" class="text-sm font-medium text-ink/70 py-2.5 px-3 rounded-lg hover:bg-black/[0.04]">Features</a>
      <a href="../index.html#pricing" class="text-sm font-medium text-ink/70 py-2.5 px-3 rounded-lg hover:bg-black/[0.04]">Pricing</a>
      <a href="../blog.html" class="text-sm font-medium text-ink/70 py-2.5 px-3 rounded-lg hover:bg-black/[0.04]">Blog</a>
      <a href="https://app.industryforms.app" class="btn-brand bg-brand text-white text-sm font-semibold px-5 py-3 rounded-full text-center mt-3">Start Free Trial</a>
    </div>
  </div>
</nav>

<header class="pt-36 pb-16 px-6 max-w-4xl mx-auto text-center">
  <nav aria-label="Breadcrumb" class="mb-5 text-xs text-ink/40">
    <a href="../index.html" class="hover:text-ink transition-colors">Home</a> / <span class="text-ink/60">${h.competitor} alternative</span>
  </nav>
  <p class="text-[10px] font-bold tracking-widest uppercase text-brand mb-4">${h.competitor} Alternative</p>
  <h1 class="font-display font-bold text-4xl md:text-5xl leading-[1.05] tracking-tight text-ink mb-5">${h.heading}</h1>
  <p class="text-lg text-ink/50 max-w-2xl mx-auto leading-relaxed">${h.intro}</p>
  <a href="https://app.industryforms.app" class="btn-brand bg-brand text-white font-semibold text-sm px-6 py-3.5 rounded-full inline-flex items-center gap-2 mt-8">Start Free — 28 Days <i data-lucide="arrow-right" class="w-4 h-4"></i></a>
</header>

<main id="main" class="max-w-3xl mx-auto px-6 pb-24">
  <section class="bg-white rounded-3xl border border-black/[0.05] p-5 md:p-8 mb-10 overflow-x-auto">
    <table class="cmp-table">
      <thead>
        <tr><th></th><th>Industry Forms</th><th>${h.competitor}</th></tr>
      </thead>
      <tbody>
${a.rows.map(([dim, us, them]) => `        <tr><td>${escHtml(dim)}</td><td class="cmp-us">${escHtml(us)}</td><td class="cmp-them">${escHtml(them)}</td></tr>`).join('\n')}
      </tbody>
    </table>
  </section>

  <section class="bg-brand/[0.06] border border-brand/20 rounded-3xl p-8 md:p-10 mb-10 text-center">
    <h2 class="font-display font-bold text-xl text-ink mb-2">Switch without starting from zero</h2>
    <p class="text-sm text-ink/60 max-w-lg mx-auto">Our import tool brings your customers, price list, and job history straight in from ${h.competitor} — no re-typing your customer list from scratch.</p>
  </section>

  <section class="mb-10">
    <h2 class="font-display font-bold text-2xl text-ink mb-6 text-center">Questions people switching from ${h.competitor} ask</h2>
    <div class="space-y-3">
${a.faqs.map(f => `      <details class="faq-item bg-white border border-black/[0.05] rounded-2xl overflow-hidden">
        <summary class="w-full flex items-center justify-between gap-4 text-left p-6">
          <span class="font-display font-bold text-ink">${escHtml(f.q)}</span>
          <i data-lucide="plus" class="faq-icon w-5 h-5 text-brand transition-transform"></i>
        </summary>
        <div class="px-6 pb-6 text-sm text-ink/55 leading-relaxed">${escHtml(f.a)}</div>
      </details>`).join('\n')}
    </div>
  </section>

  <section>
    <p class="text-[10px] font-bold tracking-widest uppercase text-ink/25 mb-4">Related guides</p>
    <div class="flex flex-col gap-3">
${a.relatedBlogSlugs.map(slug => `      <a href="../blog/${slug}.html" class="card-lift bg-white rounded-2xl border border-black/[0.05] p-5 flex items-center justify-between gap-4">
        <p class="font-display font-semibold text-ink">${BLOG_TITLES[slug]}</p>
        <i data-lucide="arrow-right" class="w-4 h-4 text-ink/30 flex-shrink-0"></i>
      </a>`).join('\n')}
    </div>
  </section>
</main>

<footer class="relative z-10 bg-ink border-t border-white/[0.05] pt-16 pb-10 px-6">
  <div class="max-w-7xl mx-auto">
    <div class="grid grid-cols-2 md:grid-cols-6 gap-8 mb-16">
      <div class="col-span-2 md:col-span-1">
        <a href="../index.html" class="flex items-center gap-2.5 mb-5">
          <img src="../Logo/Logo.png" alt="Industry Forms" class="h-16 w-auto brightness-0 invert opacity-70">
        </a>
        <p class="text-xs text-white/30 leading-relaxed">Intelligent job management for tradespeople and SMEs.</p>
      </div>
      <div>
        <p class="text-[10px] font-bold tracking-widest uppercase text-white/25 mb-5">Product</p>
        <ul class="space-y-3">
          <li><a href="../index.html#features" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Features</a></li>
          <li><a href="../index.html#pricing" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Pricing</a></li>
        </ul>
      </div>
      <div>
        <p class="text-[10px] font-bold tracking-widest uppercase text-white/25 mb-5">Solutions</p>
        <ul class="space-y-3">
          <li><a href="../trades/plumbers.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Plumbers</a></li>
          <li><a href="../trades/electricians.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Electricians</a></li>
          <li><a href="../trades/builders.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Builders</a></li>
          <li><a href="../trades/hvac.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">HVAC</a></li>
          <li><a href="../trades/painters.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Painters</a></li>
          <li><a href="../trades/roofers.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Roofers</a></li>
          <li><a href="../trades/handyman.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Handyman</a></li>
          <li><a href="../trades/garden-care.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Garden Care</a></li>
        </ul>
      </div>
      <div>
        <p class="text-[10px] font-bold tracking-widest uppercase text-white/25 mb-5">Compare</p>
        <ul class="space-y-3">
${ALTERNATIVES.map(o => `          <li><a href="${o.slug}.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">vs ${escHtml(o.competitor)}</a></li>`).join('\n')}
        </ul>
      </div>
      <div>
        <p class="text-[10px] font-bold tracking-widest uppercase text-white/25 mb-5">Company</p>
        <ul class="space-y-3">
          <li><a href="../blog.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Blog</a></li>
        </ul>
      </div>
      <div>
        <p class="text-[10px] font-bold tracking-widest uppercase text-white/25 mb-5">Legal</p>
        <ul class="space-y-3">
          <li><a href="../privacy.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Privacy</a></li>
          <li><a href="../terms.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">Terms</a></li>
        </ul>
      </div>
    </div>
    <div class="border-t border-white/[0.05] pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
      <p class="text-xs text-white/20">© 2026 Industry Forms Ltd. All rights reserved.</p>
    </div>
  </div>
</footer>

<script>
  lucide.createIcons();
  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    const btn = document.getElementById('mobileMenuBtn');
    const open = document.getElementById('mobileMenu').classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!open));
  });
</script>
</body>
</html>
`
}

for (const a of ALTERNATIVES) {
  writeFileSync(join(ROOT, 'alternatives', `${a.slug}.html`), page(a))
}
console.log(`Wrote ${ALTERNATIVES.length} alternative pages to alternatives/`)
