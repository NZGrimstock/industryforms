// Generates the 8 trade landing pages (trades/<slug>.html) referenced from
// the footer "Solutions" column and from every blog post's related-links.
// Run with `node scripts/build-trade-pages.mjs` — same pattern as
// build-blog-pages.mjs (data-driven, output committed, no build step).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

const TRADES = [
  {
    slug: 'plumbers',
    name: 'Plumbers',
    schemaType: 'Plumber',
    heading: 'Job management software for plumbers',
    intro: `Emergency call-outs, scheduled maintenance, and multi-visit jobs all in the same week — plumbing work doesn't sit still, and neither should the paperwork behind it. Industry Forms keeps quotes, jobs, materials, and invoices in one place so you can quote a blocked drain from the driveway and invoice a repipe the moment it's signed off.`,
    built: [
      'Quote on-site and send it before you’ve left the property',
      'Log every callout as a job with photos, notes, and time',
      'Track materials — fittings, pipe, fixtures — against each job so nothing goes unbilled',
      'GPS logbook for the ute, automatic and compliant for tax purposes',
      'Take payment on the spot with Stripe or Tap to Pay, no chasing invoices later',
      'Offline mobile access for jobs in basements, crawl spaces, or dead zones',
    ],
    faqs: [
      { q: 'Can I quote and invoice from the job site?', a: 'Yes. Quotes and invoices are built on your phone or tablet using your real price list, and can be sent or paid on the spot — no trip back to the office required.' },
      { q: 'Does it track materials I use on each job?', a: 'Yes. Fittings, pipe, and fixtures are recorded against the job as you use them, so nothing gets forgotten when you invoice.' },
      { q: 'What if I don’t have signal on a job?', a: 'The mobile app works offline — notes, photos, time, and materials are captured on-site and sync automatically once you’re back in range.' },
    ],
    relatedBlogSlugs: ['plumbing-business-paper-to-digital', 'cash-flow-invoice-faster', 'is-paperwork-killing-your-business'],
  },
  {
    slug: 'electricians',
    name: 'Electricians',
    schemaType: 'Electrician',
    heading: 'Job management software for electricians',
    intro: `Certificates of compliance, switchboard upgrades, and a schedule that changes by the hour — electrical work carries more paperwork liability than most trades. Industry Forms keeps every quote, job, and compliance form attached to the job it belongs to, signed and stored, so nothing gets left in a folder on the passenger seat.`,
    built: [
      'Digital compliance forms and signatures captured on-site, stored against the job forever',
      'Quote, schedule, and assign work to your team from one dashboard',
      'Record materials and labour per job for accurate costing',
      'Photo evidence attached directly to job records',
      'Generate invoices the moment a job is signed off',
      'Multi-worker jobs with a primary electrician plus assistants, all logged',
    ],
    faqs: [
      { q: 'Can I capture compliance certificates digitally?', a: 'Yes. Forms and customer signatures are completed on your phone on-site and stored against the job permanently — no filing cabinet, searchable when a client or inspector asks.' },
      { q: 'Can I assign a job to more than one electrician?', a: 'Yes. Jobs support a primary assignee plus additional team members, so multi-worker jobs are tracked accurately.' },
      { q: 'Does it work for a solo electrician as well as a team?', a: 'Yes. Pricing scales from a one-person operation up to a 25-person crew, and the workflow is the same either way.' },
    ],
    relatedBlogSlugs: ['best-job-management-app-for-electricians', 'safety-compliance-documentation-for-tradies', 'is-paperwork-killing-your-business'],
  },
  {
    slug: 'builders',
    name: 'Builders',
    schemaType: 'GeneralContractor',
    heading: 'Job management software for builders',
    intro: `A renovation isn't one job, it's dozens of quotes, visits, materials orders, and invoices strung together over months. Industry Forms tracks every quote from draft to accepted, converts it straight into a job with nothing re-entered, and keeps materials, photos, and progress invoices attached the whole way through.`,
    built: [
      'See every quote’s status at a glance — draft, sent, accepted, ready to schedule',
      'Convert an accepted quote into a job with customer details and pricing carried over',
      'Progress invoicing for staged, larger projects instead of one invoice at the end',
      'Track materials and purchase orders against the job to know your real margin',
      'Multiple site visits per job, each logged with photos and notes',
      'Projects module (Pro tier) for managing staged builds across multiple phases',
    ],
    faqs: [
      { q: 'Can I invoice a large job in stages instead of all at once?', a: 'Yes. Progress invoicing lets you bill a percentage or a fixed deposit at each stage of a larger project, rather than waiting until the whole job is complete.' },
      { q: 'Does it track my actual costs against a job?', a: 'Yes. Materials, purchase orders, and labour are recorded against each job so you can see real gross profit instead of estimating it after the fact.' },
      { q: 'What’s the Projects module?', a: 'It’s a Pro-tier add-on for managing builds staged across multiple phases — useful once a job is bigger than a single quote-to-invoice cycle.' },
    ],
    relatedBlogSlugs: ['software-to-track-quotes-for-builders', 'track-materials-on-jobs', 'try-job-management-software-free-trial'],
  },
  {
    slug: 'hvac',
    name: 'HVAC',
    schemaType: 'HVACBusiness',
    heading: 'Job management software for HVAC businesses',
    intro: `Installs, service calls, and maintenance contracts all need to be quoted, scheduled, and invoiced without the accounts side falling behind. Industry Forms links directly to Xero, so the job you invoice on-site flows straight into your books — no re-entering the same sale twice.`,
    built: [
      'Quote installs and service calls from your real price list',
      'Schedule installations and recurring maintenance calls in one calendar',
      'Digital job cards for every service visit, with parts and materials recorded',
      'Sync invoices directly to Xero — no manual double entry',
      'Photo and note capture for before/after and fault diagnosis records',
      'Works for a sole operator or a growing team of technicians',
    ],
    faqs: [
      { q: 'Does it actually connect to Xero, or just export a file?', a: 'It syncs directly — invoices created in Industry Forms push straight into Xero, so your accounting stays current without manual entry.' },
      { q: 'Can I schedule recurring maintenance visits?', a: 'Yes. Service calls and maintenance visits are scheduled the same way as any other job, so recurring contracts stay visible alongside new installs.' },
      { q: 'Is it built specifically for HVAC, or generic trade software?', a: 'It’s trade-general with HVAC-relevant workflows — parts tracking, service history, Xero sync — used alongside plumbers, electricians, and other field trades.' },
    ],
    relatedBlogSlugs: ['hvac-software-that-links-to-xero', 'field-service-scheduling-for-teams', 'cash-flow-invoice-faster'],
  },
  {
    slug: 'painters',
    name: 'Painters',
    schemaType: 'HousePainter',
    heading: 'Job management software for painters',
    intro: `A painting quote wins or loses on trust as much as price — the client can't see the prep work, so the proposal has to look as professional as the finish. Industry Forms builds branded, itemised quotes fast, and keeps before/after photos attached to every job as proof of the work done.`,
    built: [
      'Send professional, itemised quotes before you’ve left the driveway',
      'Track every quote’s status so a follow-up never gets missed',
      'Attach before/after job photos as a visual record and marketing material',
      'Record materials — paint, sundries — against each job for accurate costing',
      'Schedule multi-day jobs with visits logged individually',
      'Online quote acceptance so a client can approve and pay a deposit without a phone call',
    ],
    faqs: [
      { q: 'Can customers accept a quote and pay a deposit online?', a: 'Yes. Quotes include a secure online acceptance link, and deposits or invoices can be paid the same way — no account needed on the customer’s side.' },
      { q: 'Can I attach before and after photos to a job?', a: 'Yes. Photos are stored against the job record, useful as proof of work and as material for your own marketing.' },
      { q: 'Is it good for multi-day jobs?', a: 'Yes. A single job can have multiple scheduled visits, each with its own notes and time logged, so a week-long repaint stays organised as one job.' },
    ],
    relatedBlogSlugs: ['stop-losing-jobs-on-price-alone', 'is-paperwork-killing-your-business', 'try-job-management-software-free-trial'],
  },
  {
    slug: 'roofers',
    name: 'Roofers',
    schemaType: 'RoofingContractor',
    heading: 'Job management software for roofing contractors',
    intro: `Weather delays, changing timelines, and coordinating a crew make a roofing schedule the hardest thing to keep straight. Industry Forms gives you one calendar for every job booked, in progress, or coming up, so a rain-out doesn't mean re-building the week from memory.`,
    built: [
      'See every roofing job — booked, in progress, complete — from one schedule',
      'Reschedule a weather-delayed job without losing track of the rest of the week',
      'Assign crews to jobs and keep everyone working from the same information',
      'Site photos and notes attached directly to the job record',
      'Track materials — sheeting, fixings, flashing — used per job',
      'Generate invoices the moment a job is signed off complete',
    ],
    faqs: [
      { q: 'Can I quickly reschedule a job when weather causes a delay?', a: 'Yes. Visits can be dragged to a new date directly from the schedule view without re-entering any job details.' },
      { q: 'Does it work for a crew of subcontractors as well as employees?', a: 'Yes. Jobs can be assigned to your own team or invite a subcontractor to a specific job without giving them access to the rest of your business.' },
      { q: 'Can I track materials per job to know my margin?', a: 'Yes. Materials are recorded against each job, so you can see real cost versus quote once a roof is complete.' },
    ],
    relatedBlogSlugs: ['scheduling-tool-for-roofing-contractors', 'field-service-scheduling-for-teams', 'track-materials-on-jobs'],
  },
  {
    slug: 'handyman',
    name: 'Handyman',
    schemaType: 'HomeAndConstructionBusiness',
    heading: 'Job management software for handyman businesses',
    intro: `Running a handyman business solo means every minute of admin is a minute not on the tools. Industry Forms is built to be fast for a one-person operation: quote, complete the job, and invoice before you've driven away — no separate evening session at the kitchen table.`,
    built: [
      'Create a quote and invoice from the same job record — nothing re-typed',
      'Invoice on-site the moment a job is finished, from your phone',
      'Keep every customer’s job history in one place, searchable later',
      'Record materials used so small parts never go unbilled',
      'Take payment on the spot with Stripe or Tap to Pay',
      'No complicated setup — built for a sole trader from day one',
    ],
    faqs: [
      { q: 'Is this too much software for a one-person business?', a: 'No — it’s built for solo operators specifically. The Solo plan has no team features to wade through, just quotes, jobs, and invoices.' },
      { q: 'Can I invoice a job the moment I finish it?', a: 'Yes. Job details, materials, and pricing carry straight into the invoice, so it can be generated and sent before you leave the property.' },
      { q: 'Does it help me look more professional to customers?', a: 'Yes. Branded, itemised quotes and invoices replace handwritten notes or texted prices, which customers notice.' },
    ],
    relatedBlogSlugs: ['easiest-invoicing-app-for-handyman', 'cash-flow-invoice-faster', 'try-job-management-software-free-trial'],
  },
  {
    slug: 'garden-care',
    name: 'Garden Care',
    schemaType: 'HomeAndConstructionBusiness',
    heading: 'Job management software for garden care & landscaping',
    intro: `Recurring mowing runs, one-off landscaping quotes, and seasonal maintenance contracts don't fit neatly into the same schedule. Industry Forms handles both: a single calendar for repeat customers and new project work, with materials and time tracked against every visit.`,
    built: [
      'Schedule recurring maintenance visits alongside one-off landscaping jobs',
      'Quote landscaping projects and convert accepted quotes straight into jobs',
      'Track materials — plants, mulch, hardscaping supplies — against each job',
      'Photo evidence of completed work, useful for both records and marketing',
      'Job Map view to plan efficient routes between properties',
      'Invoice recurring customers on a schedule instead of chasing payment each time',
    ],
    faqs: [
      { q: 'Can it handle recurring mowing or maintenance customers?', a: 'Yes. Repeat visits are scheduled the same way as any job, so a recurring client sits alongside one-off project work on the same calendar.' },
      { q: 'Is there a way to plan an efficient route between properties?', a: 'Yes. The Job Map view shows scheduled jobs geographically, useful for planning a run rather than backtracking across town.' },
      { q: 'Can I quote a landscaping project and then invoice it in stages?', a: 'Yes. Quotes convert into jobs, and larger projects can be progress-invoiced rather than billed all at once at the end.' },
    ],
    relatedBlogSlugs: ['field-service-scheduling-for-teams', 'track-materials-on-jobs', 'software-to-track-quotes-for-builders'],
  },
]

const BLOG_TITLES = {
  'is-paperwork-killing-your-business': "Is Paperwork Killing Your Business? The Modern Tradie's Guide to Going Digital",
  'stop-losing-jobs-on-price-alone': 'The Professional Advantage: How to Stop Losing Jobs on Price Alone',
  'safety-compliance-documentation-for-tradies': 'Compliance Without the Headache: Mastering Safety Documentation',
  'cash-flow-invoice-faster': 'Cash Flow is King: Why You Should Never Wait Until Friday to Invoice',
  'plumbing-business-paper-to-digital': 'How to Move Your Plumbing Business from Paper to Digital',
  'best-job-management-app-for-electricians': 'Best Job Management App for Sparkies',
  'software-to-track-quotes-for-builders': 'Software to Track Quotes for Builders',
  'easiest-invoicing-app-for-handyman': 'Easiest Invoicing App for Solo Handyman',
  'track-materials-on-jobs': 'How to Stop Losing Track of Materials on Jobs',
  'hvac-software-that-links-to-xero': 'Best Software for Running a Small HVAC Business That Links to Xero',
  'field-service-scheduling-for-teams': 'Field Service Apps with Good Scheduling for Teams',
  'scheduling-tool-for-roofing-contractors': 'Best Scheduling Tool for Roofing Contractors',
  'try-job-management-software-free-trial': 'Why You Should Always Try Job Management Software Before Buying',
}

function page(t) {
  const url = `https://www.industryforms.app/trades/${t.slug}.html`
  const description = `Job management software for ${t.name.toLowerCase()} in NZ and Australia — quotes, scheduling, offline mobile job cards, invoicing, and Stripe payments in one place. Free 28-day trial.`
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t.heading} — Industry Forms</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<link rel="icon" href="../Logo/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="../Logo/favicon.png">
<meta name="theme-color" content="#E8722A">
<meta property="og:title" content="${t.heading}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://www.industryforms.app/Logo/Logo.png">
<meta property="og:site_name" content="Industry Forms">
<meta property="og:locale" content="en_NZ">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t.heading}">
<meta name="twitter:description" content="${description}">
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
      "description": "${description}",
      "areaServed": ["New Zealand", "Australia"],
      "audience": { "@type": "BusinessAudience", "audienceType": "${t.name}" },
      "offers": { "@type": "Offer", "price": "29", "priceCurrency": "NZD", "availability": "https://schema.org/InStock", "url": "https://app.industryforms.app/signup" }
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
${t.faqs.map(f => `        { "@type": "Question", "name": "${f.q}", "acceptedAnswer": { "@type": "Answer", "text": "${f.a}" } }`).join(',\n')}
      ]
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.industryforms.app/" },
        { "@type": "ListItem", "position": 2, "name": "${t.name}", "item": "${url}" }
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
  .grad-text { background: linear-gradient(135deg, #E8722A 0%, #F0A050 50%, #E8722A 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
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
    <a href="../index.html" class="hover:text-ink transition-colors">Home</a> / <span class="text-ink/60">${t.name}</span>
  </nav>
  <p class="text-[10px] font-bold tracking-widest uppercase text-brand mb-4">For ${t.name}</p>
  <h1 class="font-display font-bold text-4xl md:text-5xl leading-[1.05] tracking-tight text-ink mb-5">${t.heading.replace('Job management software for ', 'Job management software for ')}</h1>
  <p class="text-lg text-ink/50 max-w-2xl mx-auto leading-relaxed">${t.intro}</p>
  <a href="https://app.industryforms.app" class="btn-brand bg-brand text-white font-semibold text-sm px-6 py-3.5 rounded-full inline-flex items-center gap-2 mt-8">Start 4-Week Free Trial <i data-lucide="arrow-right" class="w-4 h-4"></i></a>
</header>

<main id="main" class="max-w-3xl mx-auto px-6 pb-24">
  <section class="bg-white rounded-3xl border border-black/[0.05] p-8 md:p-10 mb-10">
    <h2 class="font-display font-bold text-2xl text-ink mb-6">Built for ${t.name.toLowerCase()}</h2>
    <ul class="space-y-3">
${t.built.map(b => `      <li class="flex items-start gap-3"><i data-lucide="check" class="w-5 h-5 text-brand flex-shrink-0 mt-0.5"></i><span class="text-ink/70">${b}</span></li>`).join('\n')}
    </ul>
  </section>

  <section class="mb-10">
    <h2 class="font-display font-bold text-2xl text-ink mb-6 text-center">Questions ${t.name.toLowerCase()} ask</h2>
    <div class="space-y-3">
${t.faqs.map(f => `      <details class="faq-item bg-white border border-black/[0.05] rounded-2xl overflow-hidden">
        <summary class="w-full flex items-center justify-between gap-4 text-left p-6">
          <span class="font-display font-bold text-ink">${f.q}</span>
          <i data-lucide="plus" class="faq-icon w-5 h-5 text-brand transition-transform"></i>
        </summary>
        <div class="px-6 pb-6 text-sm text-ink/55 leading-relaxed">${f.a}</div>
      </details>`).join('\n')}
    </div>
  </section>

  <section>
    <p class="text-[10px] font-bold tracking-widest uppercase text-ink/25 mb-4">Related guides</p>
    <div class="flex flex-col gap-3">
${t.relatedBlogSlugs.map(slug => `      <a href="../blog/${slug}.html" class="card-lift bg-white rounded-2xl border border-black/[0.05] p-5 flex items-center justify-between gap-4">
        <p class="font-display font-semibold text-ink">${BLOG_TITLES[slug]}</p>
        <i data-lucide="arrow-right" class="w-4 h-4 text-ink/30 flex-shrink-0"></i>
      </a>`).join('\n')}
    </div>
  </section>
</main>

<footer class="relative z-10 bg-ink border-t border-white/[0.05] pt-16 pb-10 px-6">
  <div class="max-w-7xl mx-auto">
    <div class="grid grid-cols-2 md:grid-cols-5 gap-8 mb-16">
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
${TRADES.map(o => `          <li><a href="${o.slug}.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">${o.name}</a></li>`).join('\n')}
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

for (const t of TRADES) {
  writeFileSync(join(ROOT, 'trades', `${t.slug}.html`), page(t))
}
console.log(`Wrote ${TRADES.length} trade pages to trades/`)
