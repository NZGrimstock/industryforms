// Generates the 13 standalone blog/<slug>.html pages from the data below.
// Run once with `node scripts/build-blog-pages.mjs` whenever a post's copy
// or metadata changes — the files in blog/ are the committed output, not
// generated at request time (this is a static site with no build step).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

// Every POSTS[] field below is hardcoded by hand, not attacker-controlled — but
// it's still raw-interpolated into HTML text/attributes and into a JSON-LD
// <script> block. Escaping it anyway means the pattern stays safe if this data
// ever stops being hand-authored (e.g. if these pages get an editor later), and
// mirrors lib/website-seo.ts's serializeJsonLd() fix for the same sink class on
// the tenant sites — same bug, same fix, don't leave it unescaped just because
// today's inputs happen to be clean.
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escJsonLd(s) {
  // JSON.stringify handles quotes/backslashes/control chars correctly; strip
  // the wrapping quotes since the template already supplies them, then also
  // neutralize < so a literal </script> can't close the surrounding tag.
  return JSON.stringify(String(s)).slice(1, -1).replace(/</g, '\\u003c')
}

const CATEGORY_COLOR = { brand: 'text-brand', teal: 'text-teal', grape: 'text-grape' }

const POSTS = [
  {
    slug: 'is-paperwork-killing-your-business',
    category: 'Going Digital', color: 'brand',
    title: "Is Paperwork Killing Your Business? The Modern Tradie's Guide to Going Digital",
    description: "Why the paperwork pile costs tradies more than time — cash flow bottlenecks, billing errors, missed compliance — and what going digital actually looks like on the tools.",
    datePublished: '2026-07-02',
    ctaText: "See how simple it is to get started",
    body: `
      <p>If you're a sparky, plumber, or builder, you didn't start your own business to spend your weekends staring at a stack of invoices on the kitchen table. You started it to be on the tools, solve problems, and build things. Yet, for many, the "ute office" has become a second full-time job.</p>
      <p>If you've found yourself searching for the best job management app for sparkies or wondering how to move a plumbing business from paper to digital, you aren't alone. You're at a turning point.</p>
      <h3>The "Paper Mountain" Tax</h3>
      <p>Every minute you spend chasing a lost job sheet or manually typing up an invoice is a minute you aren't earning. But the costs of staying analog go deeper than just your time:</p>
      <ul>
        <li><strong>Cash Flow Bottlenecks:</strong> If your invoice is stuck in a folder on your passenger seat, it's not in your bank account.</li>
        <li><strong>The "Human Error" Factor:</strong> Misread handwriting leads to billing errors, which leads to awkward conversations with clients.</li>
        <li><strong>Missing Compliance:</strong> In a world of increasing regulations, losing a single safety document can lead to massive headaches later.</li>
      </ul>
      <h3>Going Digital: It's Easier Than You Think</h3>
      <p>The biggest myth in the trades is that "going digital" requires an IT degree. The truth? Modern, mobile-first tools like Industry Forms are designed to be used on the site, not in an office.</p>
      <p>Instead of keeping physical folders, think about the workflow of a modern, professional business:</p>
      <ul>
        <li><strong>Instant Capture:</strong> Create job sheets and safety forms on your phone while you're standing on the job.</li>
        <li><strong>Professional Presentation:</strong> Send branded, clean quotes that arrive before you've even left the customer's driveway.</li>
        <li><strong>Seamless Syncing:</strong> Ensure your paperwork is automatically backed up so you never have to worry about a lost notebook again.</li>
      </ul>
      <h3>Stop Working for Free</h3>
      <p>When you switch to a digital-first approach, you aren't just buying software, you're buying back your Saturday. When you use tools designed for the industry, you create a system that works for you, not the other way around.</p>
      <p>Whether you are looking for an alternative to paper job sheets for technicians or need a free trial of job management software to test the waters, the goal is the same: spend less time on the paperwork and more time on the tools.</p>
      <h3>Ready to Reclaim Your Time?</h3>
      <p>Don't wait for another Sunday night of chasing invoices. Join the tradies who are taking control of their business workflow today.</p>`,
  },
  {
    slug: 'stop-losing-jobs-on-price-alone',
    category: 'Quoting', color: 'teal',
    title: 'The Professional Advantage: How to Stop Losing Jobs on Price Alone',
    description: "Why a scrappy quote loses jobs even when the price is right — and three ways to make your quoting process look as professional as your workmanship.",
    datePublished: '2026-07-02',
    ctaText: 'Build professional quotes in minutes',
    body: `
      <p>If you've ever wondered how painters keep track of client quotes or searched for software to track quotes for builders, you know the struggle: you spend hours putting together a quote, send it off, and then… radio silence.</p>
      <p>It's easy to blame the client or assume they went with the cheapest option. But often, the reason you lost the job isn't the price, it's the professionalism of the proposal.</p>
      <h3>Why Your Quote is Your First "Job"</h3>
      <p>When a potential client asks for a quote, they aren't just looking for a number. They are looking for reassurance. They want to know that you are organized, that you won't ghost them, and that you understand the scope of their project.</p>
      <p>A handwritten note or a messy text message might get the job done, but it doesn't build trust. If you are a landscape gardener sending quotes or a cabinet maker doing custom job tracking, your quote is your first impression.</p>
      <h3>3 Ways to Upgrade Your Quoting Workflow</h3>
      <p>To win the jobs you actually want (and deserve), your quoting process needs to be as professional as your workmanship.</p>
      <ul>
        <li><strong>Speed Wins:</strong> The first professional quote to hit the client's inbox has a massive advantage. Industry Forms lets you build and send that quote while you're still standing in their driveway.</li>
        <li><strong>Professionalism Built-In:</strong> Stop sending generic price lists. Use a system that generates a branded, clear, and itemized document. When it looks like a professional firm sent it, people are more comfortable paying a premium price.</li>
        <li><strong>Track Everything:</strong> Do you know which quotes are pending, which were ignored, and which were accepted? Without a job management and quoting tool, you're flying blind. Following up on a quote isn't "annoying", it's good customer service.</li>
      </ul>
      <h3>The Bottom Line: Perception = Value</h3>
      <p>When you use a professional system to handle your quotes, you change the conversation. You aren't just a "guy with a van" anymore; you're a business owner with a system. That perception allows you to stop competing on the lowest price and start competing on the quality of your service.</p>`,
  },
  {
    slug: 'safety-compliance-documentation-for-tradies',
    category: 'Compliance', color: 'grape',
    title: 'Compliance Without the Headache: Mastering Safety Documentation',
    description: 'Manual compliance paperwork is fragile — it gets lost, damaged, and impossible to search. How to build certificates and safety records into the job workflow instead of a separate chore.',
    datePublished: '2026-07-02',
    ctaText: 'Automate your compliance documentation',
    body: `
      <p>If you've searched for an electrical certificate of compliance software app or a gas safety certificate app for plumbers, you know that the "admin" side of your trade is non-negotiable. One missing signature or a lost document can put your license, your reputation, and your business at risk.</p>
      <p>But let's be honest: spending hours chasing down paperwork after a long day on the tools is the fastest way to burn out.</p>
      <h3>The Liability Trap</h3>
      <p>When you're managing maintenance scheduling for pest control or handling scaffolding inventory and hire, you aren't just selling a service, you're selling safety and compliance. The problem is that manual paper systems are fragile. They get lost, they get damaged on-site, and they're impossible to search when you need them most.</p>
      <h3>How to Stay Compliant (And Keep Your Nights Free)</h3>
      <p>The secret to seamless compliance is building the "paperwork" into the job workflow, not adding it as a separate chore at the end of the week.</p>
      <ul>
        <li><strong>Digitize at the Source:</strong> With Industry Forms, you don't go back to the office to fill out your certificates. You complete them on your phone while you're still on-site. The data is captured once and is immediately compliant.</li>
        <li><strong>Automated Records:</strong> Instead of a physical box file that could be lost in a fire or a flood, all your safety documents are stored securely in the cloud. When a client or inspector asks for proof of compliance, you can pull it up in seconds.</li>
        <li><strong>Standardized Safety:</strong> Using templates ensures that you never forget a required checkbox or a mandatory field. It's the easiest way to guarantee that every single job is compliant, every time.</li>
      </ul>
      <h3>Why It Matters</h3>
      <p>When your paperwork is professional and immediate, your clients notice. They know you take the legal side of your trade as seriously as you take the physical side. Being the tradie who has their "certs" ready to go the moment the job is finished is exactly what builds long-term trust and repeat business.</p>`,
  },
  {
    slug: 'cash-flow-invoice-faster',
    category: 'Cash Flow', color: 'brand',
    title: 'Cash Flow is King: Why You Should Never Wait Until Friday to Invoice',
    description: "The time between finishing a job and getting paid is the most dangerous part of a small trade business. Three rules for invoicing on the spot instead of at the end of the week.",
    datePublished: '2026-07-02',
    ctaText: 'Start getting paid faster',
    body: `
      <p>If you've searched for the easiest invoicing app for a solo handyman or tradie software that links to Xero, you've likely realized that the time between finishing a job and getting paid is the most dangerous part of your business.</p>
      <p>Every day you wait to send an invoice is a day you're essentially giving your clients an interest-free loan. When you're a small operator, that's a luxury you can't afford.</p>
      <h3>The "Paperwork Lag" Trap</h3>
      <p>Many tradies still wait until the end of the week to "do the books." By then, you've forgotten the extra materials you used, you've lost the receipt, and your client has already forgotten how great a job you did. When you send an invoice five days later, it's just another piece of mail to ignore.</p>
      <p>But when you send an invoice while you're still standing in their driveway, the dynamic changes:</p>
      <ul>
        <li><strong>The "Fresh Memory" Advantage:</strong> The client is happy with the work and ready to pay. It's the path of least resistance.</li>
        <li><strong>Accuracy:</strong> You're less likely to miss billing for small parts or extra hours when you do it right on the spot.</li>
        <li><strong>Professionalism:</strong> Getting a digital invoice seconds after the work is finished signals that you are a high-level operator.</li>
      </ul>
      <h3>3 Rules for Faster Payments</h3>
      <ul>
        <li><strong>Invoice on-site:</strong> Use a tool like Industry Forms to generate your invoice the moment the tools go back in the van.</li>
        <li><strong>Make it Easy to Pay:</strong> If your invoice doesn't have a clear, click-to-pay link, you're creating work for the client. The harder it is to pay you, the longer it will take.</li>
        <li><strong>Integrate with Your Accounting:</strong> Stop double-entering data. Using tradie software that links to Xero (or your preferred accounting package) means your sales flow directly into your financial records. No more manual entry, no more typos, and no more "missing" invoices.</li>
      </ul>
      <h3>The Bottom Line: Your Time is Worth Money</h3>
      <p>You don't get paid for the time you spend on the laptop; you get paid for your expertise on the tools. By automating your invoicing workflow, you aren't just getting paid faster, you're removing the mental load of "chasing money" so you can focus on the next job.</p>`,
  },
  {
    slug: 'plumbing-business-paper-to-digital',
    category: 'Plumbing', color: 'teal',
    title: 'How to Move Your Plumbing Business from Paper to Digital',
    description: 'Paper gets lost, job cards get left in the van, and invoices go out days late. A practical look at what a plumbing business actually needs from a digital job management system.',
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>If you're still running your plumbing business using paper job sheets, handwritten quotes, and filing cabinets, you're probably spending more time on admin than you need to.</p>
      <p>Paper gets lost. Job cards get left in the van. Quotes are hard to find, and invoices often end up being sent days after the work is completed.</p>
      <p>Moving to a digital system doesn't have to be complicated.</p>
      <h3>Why Go Digital?</h3>
      <p>A digital job management system keeps everything in one place:</p>
      <ul>
        <li>Customer details</li>
        <li>Quotes</li>
        <li>Job cards</li>
        <li>Photos</li>
        <li>Materials</li>
        <li>Invoices</li>
        <li>Job history</li>
      </ul>
      <p>Instead of carrying folders around, your entire business is available from your phone, tablet or computer.</p>
      <h3>How Industry Forms Helps</h3>
      <p>Industry Forms was built for tradies who want a simple way to manage their business without learning complicated software. With Industry Forms you can:</p>
      <ul>
        <li>Create professional quotes in minutes.</li>
        <li>Convert approved quotes into jobs.</li>
        <li>Schedule work for yourself or your team.</li>
        <li>Complete digital job cards on site.</li>
        <li>Record materials used.</li>
        <li>Take photos and attach them to the job.</li>
        <li>Generate invoices when the work is finished.</li>
      </ul>
      <p>Everything stays connected, making it easy to find information whenever you need it.</p>
      <h3>Save Time Every Day</h3>
      <p>Instead of spending your evenings sorting paperwork, Industry Forms lets you update jobs while you're on site. Your office, or just you if you're a sole trader, always has the latest information without chasing paper forms.</p>
      <p>That means less admin, faster invoicing, and better cash flow.</p>
      <h3>Ready to Leave Paper Behind?</h3>
      <p>Whether you're a one-person plumbing business or managing a growing team, Industry Forms makes moving from paper to digital simple. Start creating quotes, managing jobs, scheduling work and sending invoices from one easy-to-use platform.</p>`,
  },
  {
    slug: 'best-job-management-app-for-electricians',
    category: 'Electricians', color: 'grape',
    title: 'Best Job Management App for Sparkies',
    description: 'Quotes, scheduling, digital job cards, materials, invoicing — what electrical businesses actually need from one job management app, and why simple beats feature-heavy.',
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>Running an electrical business isn't just about doing great work, it's about keeping jobs organised, getting quotes out quickly, invoicing on time, and making sure nothing falls through the cracks.</p>
      <p>If you're still using paper job sheets, spreadsheets, or multiple apps to manage your business, you're probably spending more time on admin than you need to.</p>
      <p>That's where Industry Forms comes in.</p>
      <h3>Everything You Need in One Place</h3>
      <p>Industry Forms is a job management app built for tradies, including electricians, that helps you manage your business from quote to payment. Instead of juggling paperwork, you can:</p>
      <ul>
        <li>Create professional quotes</li>
        <li>Schedule jobs and assign work</li>
        <li>Complete digital job cards on-site</li>
        <li>Record materials and labour</li>
        <li>Upload photos and notes</li>
        <li>Generate invoices in minutes</li>
        <li>Keep all customer information together</li>
      </ul>
      <p>Everything is stored securely, so you can access your jobs from anywhere.</p>
      <h3>Spend Less Time on Paperwork</h3>
      <p>Every hour spent chasing paperwork is an hour you're not earning money. With Industry Forms, your team can update job information as they work. No more handwritten notes, lost job sheets, or trying to remember what materials were used at the end of the day.</p>
      <p>The result? Faster administration, fewer mistakes, and more time on the tools.</p>
      <h3>Built for Growing Electrical Businesses</h3>
      <p>Whether you're a sole trader or managing a team of sparkies, Industry Forms grows with your business. As more jobs come in, you'll have a clear view of what's been quoted, what's scheduled, what's in progress, and what's ready to invoice, all from one dashboard.</p>
      <h3>Why Sparkies Choose Industry Forms</h3>
      <p>Electrical businesses need software that's simple, reliable, and easy to use. Industry Forms helps you:</p>
      <ul>
        <li>Stay organised</li>
        <li>Improve cash flow by invoicing sooner</li>
        <li>Keep every customer record in one place</li>
        <li>Reduce paperwork</li>
        <li>Manage your jobs from anywhere</li>
      </ul>
      <p>No complicated setup. No unnecessary features. Just practical tools that help you run your business more efficiently.</p>
      <h3>Is Industry Forms the Best Job Management App for Sparkies?</h3>
      <p>The best software is the one your team will actually use every day. Industry Forms has been designed to be straightforward, helping electricians spend less time on administration and more time doing what they do best.</p>`,
  },
  {
    slug: 'software-to-track-quotes-for-builders',
    category: 'Builders', color: 'brand',
    title: 'Software to Track Quotes for Builders',
    description: "Spreadsheets and email make it easy to lose track of where a quote is up to. How to see draft, sent, and accepted quotes in one place — and convert an accepted quote straight into a job.",
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>Quoting is one of the most important parts of running a successful building business. But if you're relying on spreadsheets, emails, or paper folders, it's easy to lose track of where each quote is up to.</p>
      <p>Has the client accepted it? Do they need a follow-up? Has the job been booked in?</p>
      <p>With Industry Forms, all of your quotes are stored in one place, making it easy to stay organised and win more work.</p>
      <h3>Never Lose Track of a Quote Again</h3>
      <p>Instead of searching through emails or paperwork, Industry Forms lets you see exactly where every quote sits. You can quickly view:</p>
      <ul>
        <li>Draft quotes</li>
        <li>Sent quotes</li>
        <li>Accepted quotes</li>
        <li>Jobs ready to schedule</li>
      </ul>
      <p>Everything is organised, so you always know what needs your attention.</p>
      <h3>Turn Quotes into Jobs</h3>
      <p>Once a customer accepts your quote, there's no need to start again. With Industry Forms, you can convert your quote into a job, keeping all the customer details, pricing, and job information together. This saves time, reduces mistakes, and keeps your workflow moving.</p>
      <h3>Keep Your Building Business Organised</h3>
      <p>Whether you're quoting renovations, new builds, decks, fences, or maintenance work, Industry Forms helps you manage every stage of the job. You can:</p>
      <ul>
        <li>Create professional quotes</li>
        <li>Store customer information</li>
        <li>Schedule upcoming work</li>
        <li>Record job notes and photos</li>
        <li>Track materials</li>
        <li>Generate invoices when the work is complete</li>
      </ul>
      <p>Everything is connected, giving you a complete record from the first quote through to final payment.</p>
      <h3>Spend Less Time on Admin</h3>
      <p>Builders should be building, not chasing paperwork. Industry Forms simplifies your day-to-day administration so you can spend less time in the office and more time on site. With everything stored digitally, your information is always available when you need it.</p>`,
  },
  {
    slug: 'easiest-invoicing-app-for-handyman',
    category: 'Invoicing', color: 'teal',
    title: 'Easiest Invoicing App for Solo Handyman',
    description: 'Finish the job, pack up, and send the invoice before you drive away. How sole traders use Industry Forms to invoice on the spot instead of at the kitchen table that night.',
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>When you're running a handyman business on your own, every minute counts. The last thing you want after a full day on the tools is to spend your evening creating invoices.</p>
      <p>That's why many sole traders are switching to Industry Forms, a simple job management app that makes invoicing fast and hassle-free.</p>
      <h3>Invoice Before You Leave the Job</h3>
      <p>Imagine finishing a job, packing up your tools, and sending the invoice before you even drive away. With Industry Forms, your customer details, job information, and pricing are already saved. Simply review the job, generate the invoice, and send it directly to your customer.</p>
      <p>Getting invoices out sooner means you're more likely to get paid sooner too.</p>
      <h3>More Than Just Invoicing</h3>
      <p>While invoicing is important, running a business involves much more than getting paid. Industry Forms also helps you:</p>
      <ul>
        <li>Send professional quotes</li>
        <li>Schedule upcoming jobs</li>
        <li>Keep customer details organised</li>
        <li>Record notes and photos</li>
        <li>Track materials used</li>
        <li>Store the complete history of every job</li>
      </ul>
      <p>Everything is linked together, so you don't need multiple apps to run your business.</p>
      <h3>Keep Your Business Looking Professional</h3>
      <p>Customers notice the little things. Sending clear, professional quotes and invoices helps build confidence in your business and leaves a great impression.</p>
      <p>Whether you're fixing a leaking tap, assembling furniture, repairing a fence, or completing property maintenance, Industry Forms helps you present your business professionally from the first quote to the final invoice.</p>
      <h3>Spend Less Time on Admin</h3>
      <p>Paper invoices, spreadsheets, and handwritten notes all add extra work to your day. Industry Forms keeps everything in one place, so you can focus on completing more jobs instead of sorting through paperwork at night.</p>`,
  },
  {
    slug: 'track-materials-on-jobs',
    category: 'Materials', color: 'grape',
    title: 'How to Stop Losing Track of Materials on Jobs',
    description: "A few fittings here, an extra length of pipe there — unbilled materials add up to real money over a year. How to record what's used against every job as you go, not from memory at the end of the day.",
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>Have you ever finished a job only to realise you forgot to charge for half the materials you used?</p>
      <p>It happens more often than most tradies would like to admit. A few fittings here, an extra length of pipe there, another box of screws, it all adds up. Over time, those missed items can cost your business thousands of dollars.</p>
      <h3>Stop Relying on Memory</h3>
      <p>Trying to remember every material at the end of a busy day isn't realistic. Whether you're working across multiple jobs or juggling a team, it's easy for things to be missed.</p>
      <p>With Industry Forms, you can record materials as you go, so nothing gets forgotten.</p>
      <h3>Everything Stored Against the Job</h3>
      <p>Every job in Industry Forms has its own record where you can keep track of:</p>
      <ul>
        <li>Materials used</li>
        <li>Labour</li>
        <li>Photos</li>
        <li>Notes</li>
        <li>Customer details</li>
        <li>Quotes and invoices</li>
      </ul>
      <p>When it's time to invoice, all the information is already there, making the process faster and more accurate.</p>
      <h3>Know What Every Job Is Costing You</h3>
      <p>Keeping track of materials isn't just about invoicing, it's about understanding your costs. Having a clear record of what's been used on each job helps you see where your money is going and makes it easier to price future work with confidence.</p>
      <h3>Built for Every Trade</h3>
      <p>Whether you're an electrician, plumber, builder, painter, landscaper, roofer, HVAC technician, or handyman, keeping track of materials is essential to running a profitable business. Industry Forms is designed to make that process simple without adding extra paperwork.</p>
      <h3>Keep More of What You Earn</h3>
      <p>Every missed item is money left on the table. By recording materials as you work, you'll reduce mistakes, improve your invoicing, and have a complete history of every job.</p>`,
  },
  {
    slug: 'hvac-software-that-links-to-xero',
    category: 'HVAC', color: 'brand',
    title: 'Best Software for Running a Small HVAC Business That Links to Xero',
    description: 'Running two separate systems for job management and accounting means entering everything twice. How HVAC businesses use Industry Forms alongside Xero without the double data entry.',
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>Running an HVAC business means more than just servicing heat pumps and air conditioning systems. You're quoting new work, scheduling jobs, ordering parts, sending invoices, and trying to keep your accounts up to date.</p>
      <p>Using separate systems for job management and accounting can quickly become frustrating. That's why many HVAC businesses are looking for tradie software that links to Xero while still being simple enough to use every day.</p>
      <h3>One Place to Manage Your Business</h3>
      <p>Industry Forms helps you keep your jobs organised from start to finish. From the moment a customer requests a quote, you can manage the entire process in one platform:</p>
      <ul>
        <li>Create professional quotes</li>
        <li>Schedule installations and service calls</li>
        <li>Complete digital job cards</li>
        <li>Record parts and materials used</li>
        <li>Capture photos and notes</li>
        <li>Generate invoices</li>
      </ul>
      <p>Everything stays connected, making it easy to keep track of every customer and every job.</p>
      <h3>Works Seamlessly with Xero</h3>
      <p>Nobody enjoys entering the same information twice. Industry Forms integrates with Xero, allowing your invoicing and accounting to work together. That means less manual data entry, fewer mistakes, and more time spent running your business instead of your books.</p>
      <p>Whether you're a sole trader or have a growing team, connecting your job management software with Xero helps streamline your workflow.</p>
      <h3>Built for Growing Trade Businesses</h3>
      <p>As your business grows, so does the paperwork, unless you have the right tools. Industry Forms is designed for HVAC businesses but works just as well for electricians, plumbers, builders, roofers, landscapers, painters, handymen, and many other service industries.</p>
      <p>It's easy to use, simple to learn, and gives you everything you need to stay organised without paying for features you'll never use.</p>`,
  },
  {
    slug: 'field-service-scheduling-for-teams',
    category: 'Scheduling', color: 'teal',
    title: 'Field Service Apps with Good Scheduling for Teams',
    description: 'Endless phone calls and a whiteboard are not a scheduling system. How to keep a field crew of any size on the same page — who is assigned where, and what they need before they arrive.',
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>Keeping a team organised shouldn't mean endless phone calls, text messages, and scribbled notes on a whiteboard.</p>
      <p>When jobs change throughout the day, it's easy for someone to end up at the wrong site, miss an appointment, or not have the information they need. A good scheduling system keeps everyone on the same page.</p>
      <h3>Schedule Smarter, Not Harder</h3>
      <p>With Industry Forms, you can create jobs, assign them to team members, and keep your schedule organised from one place. Whether you're managing two employees or twenty, you'll always know:</p>
      <ul>
        <li>Who is assigned to each job</li>
        <li>What work needs to be completed</li>
        <li>Customer details</li>
        <li>Job notes and photos</li>
        <li>Upcoming appointments</li>
      </ul>
      <p>Your team has the information they need before they arrive on site, reducing confusion and unnecessary phone calls.</p>
      <h3>Built for Businesses on the Move</h3>
      <p>Industry Forms is designed for businesses that spend their day on the road. Whether you're running an electrical company, plumbing business, HVAC team, landscaping crew, painting company, or any other field service business, you can manage your schedule from wherever you are.</p>
      <p>When a new job comes in or plans change, updating your schedule is quick and easy.</p>
      <h3>More Than Just a Calendar</h3>
      <p>Scheduling is only part of running a successful business. Industry Forms also lets you:</p>
      <ul>
        <li>Create and send quotes</li>
        <li>Convert accepted quotes into jobs</li>
        <li>Complete digital job cards</li>
        <li>Record materials and labour</li>
        <li>Generate invoices</li>
        <li>Keep a complete history of every customer</li>
      </ul>
      <p>Everything works together, so you don't need separate apps for each task.</p>`,
  },
  {
    slug: 'scheduling-tool-for-roofing-contractors',
    category: 'Roofing', color: 'grape',
    title: 'Best Scheduling Tool for Roofing Contractors',
    description: 'Weather delays, changing timelines, and coordinating a crew make roofing schedules messy fast. How to see every job booked, in progress, or coming up next, in one place.',
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today',
    body: `
      <p>When you're managing multiple roofing jobs, keeping your schedule organised is just as important as doing quality work. Between weather delays, changing timelines, customer requests, and coordinating your crew, it's easy for things to get messy.</p>
      <p>That's where Industry Forms helps. Designed for tradies, Industry Forms gives roofing contractors a simple way to schedule jobs, manage customers, and keep the whole team on the same page.</p>
      <h3>Keep Every Roofing Job Organised</h3>
      <p>With Industry Forms, you can see all your upcoming jobs in one place and quickly assign work to the right people. Whether you're replacing a roof, carrying out repairs, or completing new builds, you'll always know what's booked, what's in progress, and what's coming up next.</p>
      <h3>Everything Connected</h3>
      <p>Scheduling is only one part of the job. Industry Forms also helps you manage the entire workflow. From one platform you can:</p>
      <ul>
        <li>Create and send professional quotes</li>
        <li>Schedule jobs and assign your team</li>
        <li>Complete digital job cards</li>
        <li>Upload site photos and notes</li>
        <li>Track materials used</li>
        <li>Generate invoices once the work is complete</li>
      </ul>
      <p>No more switching between different apps or chasing paperwork.</p>
      <h3>Perfect for Teams of Any Size</h3>
      <p>Whether you're a sole trader or running multiple roofing crews, Industry Forms scales with your business. Everyone has access to the information they need, helping reduce miscommunication and keeping jobs running smoothly.</p>
      <h3>Spend Less Time Organising, More Time Roofing</h3>
      <p>The right scheduling software doesn't just fill a calendar, it helps your entire business run more efficiently.</p>`,
  },
  {
    slug: 'try-job-management-software-free-trial',
    category: 'Free Trial', color: 'brand',
    title: 'Why You Should Always Try Job Management Software Before Buying',
    description: "Demos and feature lists can't tell you whether software fits how you actually work. Why a real free trial, using your own jobs and quotes, is the only way to know.",
    datePublished: '2026-07-03',
    ctaText: 'Start your free trial today, no guesswork',
    body: `
      <p>Every job management system promises to save you time, reduce paperwork, and make running your business easier. But how do you know if it actually will?</p>
      <p>The answer is simple: don't buy it until you've tried it.</p>
      <p>A free trial gives you the chance to see whether the software fits the way you work. Can you create a quote in minutes? Is scheduling easy? Can your team pick it up without hours of training? These are questions you can only answer by using it yourself.</p>
      <p>That's exactly why Industry Forms offers a free trial. Rather than watching demos or reading feature lists, you can jump in and start creating jobs, sending quotes, scheduling work, and generating invoices using your own business data.</p>
      <p>You'll quickly see how much time can be saved by replacing paper forms, spreadsheets, or multiple apps with one simple platform.</p>
      <p>Whether you're an electrician, plumber, builder, roofer, painter, landscaper, handyman or any other trade business, Industry Forms is designed to make the day-to-day running of your business easier, not more complicated.</p>
      <p>If you're searching for free trial job management software for trades, don't settle for software that looks good on paper. Experience it for yourself and discover how Industry Forms can help you stay organised, invoice faster, and spend more time doing the work that makes you money.</p>`,
  },
]

const DATE_MODIFIED = '2026-08-04'

function relatedPosts(current) {
  const others = POSTS.filter(p => p.slug !== current.slug)
  const startIdx = POSTS.indexOf(current) * 3 % others.length
  return [0, 1, 2].map(i => others[(startIdx + i) % others.length])
}

function page(post) {
  const url = `https://www.industryforms.app/blog/${post.slug}.html`
  const related = relatedPosts(post)
  const h = { title: escHtml(post.title), description: escHtml(post.description), category: escHtml(post.category), ctaText: escHtml(post.ctaText) }
  const j = { title: escJsonLd(post.title), description: escJsonLd(post.description) }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${h.title} — Industry Forms</title>
<meta name="description" content="${h.description}">
<link rel="canonical" href="${url}">
<link rel="icon" href="../Logo/favicon.png" type="image/png">
<link rel="apple-touch-icon" href="../Logo/favicon.png">
<meta name="theme-color" content="#E8722A">
<meta property="og:title" content="${h.title}">
<meta property="og:description" content="${h.description}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://www.industryforms.app/Logo/Logo.png">
<meta property="og:site_name" content="Industry Forms">
<meta property="og:locale" content="en_NZ">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${h.title}">
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
      "@type": "BlogPosting",
      "headline": "${j.title}",
      "description": "${j.description}",
      "datePublished": "${post.datePublished}",
      "dateModified": "${DATE_MODIFIED}",
      "author": { "@type": "Organization", "name": "Industry Forms" },
      "publisher": {
        "@type": "Organization",
        "name": "Industry Forms",
        "logo": { "@type": "ImageObject", "url": "https://www.industryforms.app/Logo/Logo.png" }
      },
      "image": "https://www.industryforms.app/Logo/Logo.png",
      "mainEntityOfPage": { "@type": "WebPage", "@id": "${url}" }
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.industryforms.app/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.industryforms.app/blog.html" },
        { "@type": "ListItem", "position": 3, "name": "${j.title}", "item": "${url}" }
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
  .prose-post p { margin-bottom: 1rem; line-height: 1.75; color: rgba(28,28,46,0.7); }
  .prose-post h3 { font-family: 'Sora', sans-serif; font-weight: 700; font-size: 1.15rem; margin: 1.5rem 0 0.75rem; color: #1C1C2E; }
  .prose-post ul { list-style: disc; padding-left: 1.25rem; margin-bottom: 1rem; }
  .prose-post li { margin-bottom: 0.5rem; line-height: 1.7; color: rgba(28,28,46,0.7); }
  .prose-post strong { color: #1C1C2E; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: #F6F2EC; }
  ::-webkit-scrollbar-thumb { background: #C8C0B4; border-radius: 10px; }
  .sr-only-focusable { position: absolute; left: -9999px; top: 0; z-index: 100; background: #E8722A; color: #fff; padding: 0.75rem 1.25rem; border-radius: 0 0 0.5rem 0; font-weight: 600; font-size: 0.875rem; }
  .sr-only-focusable:focus { left: 0; }
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
      <a href="../blog.html" class="text-sm font-medium text-ink transition-colors duration-150">Blog</a>
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

<main id="main" class="max-w-3xl mx-auto px-6 pt-36 pb-24">
  <nav aria-label="Breadcrumb" class="mb-6 text-xs text-ink/40">
    <a href="../blog.html" class="hover:text-ink transition-colors">Blog</a> / <span class="text-ink/60">${h.category}</span>
  </nav>
  <article class="bg-white rounded-3xl border border-black/[0.05] p-8 md:p-10 scroll-mt-24">
    <p class="text-xs font-semibold ${CATEGORY_COLOR[post.color]} mb-2">${h.category}</p>
    <h1 class="font-display font-bold text-2xl md:text-3xl text-ink mb-6 leading-tight">${h.title}</h1>
    <div class="prose-post">${post.body}
    </div>
    <a href="https://app.industryforms.app" class="btn-brand bg-brand text-white font-semibold text-sm px-6 py-3 rounded-full inline-flex items-center gap-2 mt-2">${h.ctaText} <i data-lucide="arrow-right" class="w-4 h-4"></i></a>
  </article>

  <div class="mt-10">
    <p class="text-[10px] font-bold tracking-widest uppercase text-ink/25 mb-4">More from the blog</p>
    <div class="flex flex-col gap-3">
      ${related.map(r => `<a href="${r.slug}.html" class="card-lift bg-white rounded-2xl border border-black/[0.05] p-5 flex items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold ${CATEGORY_COLOR[r.color]} mb-1">${escHtml(r.category)}</p>
          <p class="font-display font-semibold text-ink">${escHtml(r.title)}</p>
        </div>
        <i data-lucide="arrow-right" class="w-4 h-4 text-ink/30 flex-shrink-0"></i>
      </a>`).join('\n      ')}
    </div>
  </div>
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
          <li><a href="../alternatives/tradify.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">vs Tradify</a></li>
          <li><a href="../alternatives/jobber.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">vs Jobber</a></li>
          <li><a href="../alternatives/servicem8.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">vs ServiceM8</a></li>
          <li><a href="../alternatives/fergus.html" class="text-sm text-white/45 hover:text-white transition-colors duration-150">vs Fergus</a></li>
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

for (const post of POSTS) {
  writeFileSync(join(ROOT, 'blog', `${post.slug}.html`), page(post))
}
console.log(`Wrote ${POSTS.length} blog pages to blog/`)
