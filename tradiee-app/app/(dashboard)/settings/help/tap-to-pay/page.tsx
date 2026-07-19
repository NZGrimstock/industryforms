import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { PrintButton } from './print-button'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, AlertTriangle, Smartphone, Landmark, CreditCard, ShieldCheck } from 'lucide-react'

// Static instructional page — "Stripe Onboarding for Tap to Pay".
// The "screenshots" are CSS mockups of each screen (Stripe's hosted flow is
// personalised per merchant, so real screenshots can't be captured ahead of
// time) — drawn to match what the merchant will actually see.

function StepNum({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent,#f97316)] text-white text-sm font-bold">
      {n}
    </span>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-5 border-b border-gray-100 last:border-0 break-inside-avoid">
      <StepNum n={n} />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h3>
        <div className="text-sm text-gray-600 space-y-2 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

// A framed "what you'll see" mockup panel.
function Screen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="my-3 max-w-md break-inside-avoid">
      <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shadow-sm">
        <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
        </div>
        <div className="p-4 bg-white">{children}</div>
      </div>
      <p className="mt-1 text-[11px] text-gray-400 italic">What you&apos;ll see — {label}</p>
    </div>
  )
}

function MockInput({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-2.5">
      <p className="text-[11px] font-medium text-gray-500 mb-1">{label}</p>
      <div className="h-9 rounded-lg border border-gray-300 bg-white px-3 flex items-center text-sm text-gray-700">
        {value ?? ''}
      </div>
    </div>
  )
}

function MockButton({ children, purple = false }: { children: React.ReactNode; purple?: boolean }) {
  return (
    <div className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white ${purple ? 'bg-[#635bff]' : 'bg-[var(--accent,#f97316)]'}`}>
      {children}
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 text-sm text-blue-800 break-inside-avoid">
      <span className="font-semibold shrink-0">Tip:</span>
      <span>{children}</span>
    </div>
  )
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800 break-inside-avoid">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}

export default async function TapToPayHelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user!.id).single()

  return (
    <>
      <div className="print:hidden">
        <Header title="Help — Get paid with Tap to Pay" profile={profile} />
      </div>
      <div className="p-6 max-w-3xl">
        <div className="flex items-center justify-between gap-3 mb-6 print:hidden">
          <Link href="/settings?tab=help" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Link>
          <PrintButton />
        </div>

        {/* Title block */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Getting paid by card — step-by-step setup</h1>
          <p className="text-sm text-gray-600 leading-relaxed">
            Follow this guide once and you&apos;ll be able to take card payments — online invoice payments
            and <strong>Tap to Pay on iPhone</strong> (customer taps their card on your phone, no EFTPOS
            machine needed). The money goes <strong>straight into your own bank account</strong>.
            IndustryForms takes no cut. Card payments are handled by <strong>Stripe</strong>, the same
            company that processes payments for Xero, Countdown and thousands of NZ businesses.
          </p>
          <p className="text-sm text-gray-600 mt-2">Takes about <strong>10 minutes</strong>. Do it once, done forever.</p>
        </div>

        {/* What you need */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-8 break-inside-avoid">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Before you start, grab these:</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              ["Your phone", "Stripe texts you a code to confirm it's you."],
              ["Your bank account number", "The account you want the money paid into."],
              ["Your driver licence or passport", "Stripe may ask for a photo of it to verify your identity — this is a legal requirement for anyone handling card payments."],
              ["If you're a registered company: your NZBN or company number", "Sole traders can skip this one."],
            ].map(([title, sub]) => (
              <li key={title} className="flex gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <span><strong>{title}</strong> — {sub}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Warn>
              You must be the <strong>owner</strong> (or an admin) of your IndustryForms account to do this.
              If you&apos;re a staff member, hand this guide to the boss.
            </Warn>
          </div>
        </div>

        {/* PART 1 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <div className="flex items-center gap-2.5 mb-2">
            <Landmark className="h-5 w-5 text-[var(--accent,#f97316)]" />
            <h2 className="text-lg font-bold text-gray-900">Part 1 — Start in IndustryForms</h2>
          </div>
          <p className="text-sm text-gray-500 mb-2">Do this on a computer, or in your phone&apos;s web browser — not the mobile app.</p>

          <Step n={1} title="Log in to the web app">
            <p>Go to <strong>app.industryforms.app</strong> and log in with your usual email and password.</p>
          </Step>

          <Step n={2} title="Open Settings → Subscription">
            <p>Click <strong>Settings</strong> in the left-hand menu, then click the <strong>Subscription</strong> tab along the top.</p>
          </Step>

          <Step n={3} title="Find &quot;Get paid — card payments&quot; and click Set up payouts">
            <p>Scroll down until you see this box, then click the button:</p>
            <Screen label="the Get paid box in Settings → Subscription">
              <p className="text-sm font-bold text-gray-900 mb-1">Get paid — card payments</p>
              <p className="text-xs text-gray-500 mb-3">
                Connect your own Stripe account so customer payments — online invoices, deposits and Tap to
                Pay — land directly in your bank account. IndustryForms takes no cut.
              </p>
              <MockButton>Set up payouts</MockButton>
            </Screen>
            <p>
              Your browser will jump to a page on <strong>connect.stripe.com</strong>. That&apos;s meant to
              happen — Stripe collects your details directly so IndustryForms never sees your ID or bank details.
            </p>
          </Step>
        </div>

        {/* PART 2 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <div className="flex items-center gap-2.5 mb-2">
            <ShieldCheck className="h-5 w-5 text-[var(--accent,#f97316)]" />
            <h2 className="text-lg font-bold text-gray-900">Part 2 — Answer Stripe&apos;s questions</h2>
          </div>
          <p className="text-sm text-gray-500 mb-2">
            Stripe walks you through a few short screens. Here&apos;s every one, in order, and what to put in.
          </p>

          <Step n={4} title="Confirm your mobile and email">
            <Screen label="Stripe&apos;s first screen">
              <MockInput label="Mobile number" value="+64 21 123 4567" />
              <MockInput label="Email" value="you@yourbusiness.co.nz" />
              <MockButton purple>Continue →</MockButton>
            </Screen>
            <p>
              Enter your mobile number and email, press <strong>Continue</strong>, then type in the
              <strong> 6-digit code</strong> Stripe texts you.
            </p>
            <Tip>Use the email address you actually check — Stripe sends payout notifications there.</Tip>
          </Step>

          <Step n={5} title="Type of business — pick the one that matches your tax setup">
            <Screen label="the business type question">
              <p className="text-sm font-semibold text-gray-800 mb-2.5">What type of business are you?</p>
              {['Individual / Sole trader', 'Company', 'Partnership', 'Trust'].map((option, i) => (
                <div key={option} className={`mb-1.5 rounded-lg border px-3 py-2 text-sm ${i === 0 ? 'border-[#635bff] bg-[#635bff]/5 font-medium text-gray-900' : 'border-gray-200 text-gray-600'}`}>
                  {option}
                </div>
              ))}
            </Screen>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Individual / Sole trader</strong> — you work under your own name or a trading name, no registered company. Most one-man bands pick this.</li>
              <li><strong>Company</strong> — you&apos;re a registered limited company (your invoices say &quot;… Ltd&quot;). You&apos;ll need your NZBN / company number.</li>
            </ul>
            <Tip>Not sure? Whatever your accountant set up for your GST/tax is the answer. Get it wrong and Stripe will just ask you to fix it later — nothing breaks.</Tip>
          </Step>

          <Step n={6} title="Your personal details">
            <p>Fill in exactly as they appear on your driver licence or passport:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Legal name</strong> — your real name, not your business name.</li>
              <li><strong>Date of birth</strong></li>
              <li><strong>Home address</strong> — where you live, not the yard or the PO Box.</li>
            </ul>
            <Warn>If the name here doesn&apos;t match your ID, Stripe&apos;s verification will fail and your first payout will be held up. Double-check spelling.</Warn>
          </Step>

          <Step n={7} title="Your business details">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Industry</strong> — click the dropdown and pick the closest match to your trade.
                Look under <em>Construction</em> or <em>Home services</em> — e.g. &quot;General contractor&quot;,
                &quot;Electrical contractor&quot;, &quot;Plumbing&quot;, &quot;Landscaping&quot;. Closest is fine; there&apos;s no wrong answer that breaks anything.
              </li>
              <li>
                <strong>Business website</strong> — paste your IndustryForms website link if you&apos;ve set one up
                (Settings → Website), or your Facebook business page. If you have neither, Stripe lets you
                describe what you sell instead — write something like <em>&quot;Residential plumbing services, paid by invoice&quot;</em>.
              </li>
            </ul>
          </Step>

          <Step n={8} title="Company only: registered details">
            <p>
              If you picked <strong>Company</strong> in step 5, Stripe also asks for your <strong>NZBN or
              company number</strong> (it can look your company up by name), your registered office address,
              and the people who own or run the company. Add <strong>yourself as a director</strong>, and
              anyone who owns <strong>25% or more</strong> of the company. Sole traders skip this screen entirely.
            </p>
          </Step>

          <Step n={9} title="Bank account — where your money goes">
            <Screen label="the payout bank account screen">
              <p className="text-sm font-semibold text-gray-800 mb-2.5">Add your bank account for payouts</p>
              <MockInput label="Account number" value="02-1234-0123456-00" />
              <MockButton purple>Save</MockButton>
            </Screen>
            <p>
              Type your bank account number — the one on your bank statements.
              NZ accounts look like <strong>02-1234-0123456-00</strong>; Australian accounts use a
              <strong> BSB + account number</strong>.
            </p>
            <Warn>Read it back twice. A wrong digit here sends your payouts to the wrong place — this is the one field you really don&apos;t want a typo in.</Warn>
          </Step>

          <Step n={10} title="Review and submit">
            <p>
              Stripe shows a summary of everything. Anything with a <strong className="text-red-500">red !</strong> next
              to it needs fixing — tap it, fill in what&apos;s missing. When everything&apos;s green, press
              <strong> Agree and submit</strong>.
            </p>
            <p>Stripe may ask for a <strong>photo of your driver licence or passport</strong> here — use your phone camera, make sure the whole card is in frame and readable.</p>
          </Step>
        </div>

        {/* PART 3 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <div className="flex items-center gap-2.5 mb-2">
            <CheckCircle2 className="h-5 w-5 text-[var(--accent,#f97316)]" />
            <h2 className="text-lg font-bold text-gray-900">Part 3 — Check it worked</h2>
          </div>

          <Step n={11} title="Look for the green banner back in Settings">
            <p>After submitting you land back in IndustryForms. In the same &quot;Get paid&quot; box you should now see:</p>
            <Screen label="all set up">
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <p className="text-sm font-medium text-green-800">Payouts active — you&apos;re set to take payments.</p>
              </div>
            </Screen>
            <p>See that? <strong>You&apos;re done with setup.</strong> Skip to Part 4.</p>
            <p>If you instead see an amber box:</p>
            <Screen label="Stripe still needs something">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-3">
                <p className="text-sm font-medium text-amber-800">Setup incomplete</p>
                <p className="text-xs text-amber-700 mt-0.5">Stripe still needs a few more details before you can take payments.</p>
              </div>
              <MockButton>Finish setup</MockButton>
            </Screen>
            <p>
              That means Stripe is either still checking your details (give it a few minutes and refresh the page)
              or needs one more thing — click <strong>Finish setup</strong> and it takes you straight to
              whatever&apos;s missing. It&apos;s usually the ID photo.
            </p>
          </Step>
        </div>

        {/* PART 4 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <div className="flex items-center gap-2.5 mb-2">
            <Smartphone className="h-5 w-5 text-[var(--accent,#f97316)]" />
            <h2 className="text-lg font-bold text-gray-900">Part 4 — Your first Tap to Pay payment (iPhone)</h2>
          </div>

          <Step n={12} title="Open the invoice on your iPhone">
            <p>
              In the IndustryForms mobile app, open the job&apos;s invoice and tap <strong>Tap to Pay</strong> —
              or go to <strong>More → Pay Now</strong> and pick the invoice from the list.
            </p>
          </Step>

          <Step n={13} title="First time only: the owner or an admin must do it">
            <p>
              The very first Tap to Pay payment on each iPhone accepts Apple&apos;s terms, and only an
              <strong> owner or admin</strong> login can do that. Staff will see a message asking them to get
              an admin — after an admin has done one payment on that phone, staff can use it freely.
            </p>
            <p>
              You&apos;ll also see <strong>&quot;Configuring Tap to Pay… %&quot;</strong> with a progress number the
              first time. That&apos;s a one-off download — give it a minute.
            </p>
          </Step>

          <Step n={14} title="Customer taps, you're paid">
            <Screen label="collecting the payment">
              <div className="flex flex-col items-center py-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-orange-200 bg-orange-50 mb-3">
                  <CreditCard className="h-9 w-9 text-[var(--accent,#f97316)]" />
                </div>
                <p className="text-sm font-bold text-gray-900">Tap card or device to pay</p>
                <p className="text-2xl font-extrabold text-[var(--accent,#f97316)] mt-1">$293.25</p>
              </div>
            </Screen>
            <p>
              Hold your iPhone out flat. The customer taps their <strong>card, phone or watch</strong> on the
              <strong> top edge</strong> of your iPhone and holds it there until the tick appears. That&apos;s it —
              the invoice is marked <strong>paid</strong> automatically, and you can send them a receipt from
              the success screen.
            </p>
          </Step>
        </div>

        {/* Money */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6 break-inside-avoid">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Where&apos;s my money?</h2>
          <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
            <li>Payments go into your Stripe balance the moment the customer pays, then Stripe automatically pays them out to your bank account.</li>
            <li><strong>Your first payout takes about 7 days</strong> — Stripe holds it a little longer while they verify a brand-new account. After that, payouts arrive in around <strong>2 business days</strong>.</li>
            <li>Stripe&apos;s card processing fee comes off each payment (that&apos;s how card payments work everywhere). <strong>IndustryForms takes nothing.</strong></li>
            <li>Stripe emails you when payouts are on the way, and you can log in to Stripe any time to see the details.</li>
          </ul>
        </div>

        {/* Troubleshooting */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6 break-inside-avoid">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Something not working?</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-400">
                  <th className="py-2 pr-4 font-medium">What you see</th>
                  <th className="py-2 font-medium">What to do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 align-top">
                <tr>
                  <td className="py-2.5 pr-4 italic">&quot;Complete payouts setup in Settings → Subscription before taking card payments.&quot;</td>
                  <td className="py-2.5">You haven&apos;t finished this guide — go back to Part 1.</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 italic">&quot;Only an owner or admin can set up payouts&quot;</td>
                  <td className="py-2.5">You&apos;re logged in as staff. The business owner needs to do the setup.</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 italic">&quot;Tap to Pay isn&apos;t set up on this iPhone yet…&quot;</td>
                  <td className="py-2.5">An owner or admin needs to take one payment on this iPhone first (Part 4, step 13).</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 italic">Amber &quot;Setup incomplete&quot; box won&apos;t go away</td>
                  <td className="py-2.5">Click <strong>Finish setup</strong> — Stripe will show exactly what it&apos;s waiting on (usually an ID photo). If you&apos;ve done that, wait a few hours; verification isn&apos;t instant.</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 italic">Customer tapped but the payment failed</td>
                  <td className="py-2.5">Ask them to tap again and hold longer, or try a different card. Check your phone has internet. If it keeps failing it&apos;s usually the customer&apos;s card, not you.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4">
            Still stuck? Email <a className="text-[var(--accent,#f97316)] hover:underline" href="mailto:support@industryforms.app">support@industryforms.app</a> and
            tell us which step you&apos;re on — we&apos;ll sort it.
          </p>
        </div>
      </div>
    </>
  )
}
