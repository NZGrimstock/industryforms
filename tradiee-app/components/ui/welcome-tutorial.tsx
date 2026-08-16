'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarCheck, Car, CheckCircle2, CreditCard, FileText, ReceiptText, Sparkles, X } from 'lucide-react'

type TutorialStep = {
  eyebrow: string
  title: string
  body: string
  icon: typeof Car
  targetClass: string
}

const STEPS: TutorialStep[] = [
  {
    eyebrow: 'Automatic Logbook and job time tracking',
    title: 'Your travel and time can track itself',
    body: 'During trading hours, IndustryForms can capture GPS travel, job time, and visit history so mileage and billable hours stop living in someone’s memory.',
    icon: Car,
    targetClass: 'target-logbook',
  },
  {
    eyebrow: 'Automated SMS follow-ups for unpaid invoices',
    title: 'Stop manually chasing late payers',
    body: 'Invoices can be nudged automatically by SMS and email, while your usage is metered for monthly billing.',
    icon: ReceiptText,
    targetClass: 'target-invoices',
  },
  {
    eyebrow: 'AI quoting tied to your price list',
    title: 'Draft faster without inventing numbers',
    body: 'Smart quote drafting uses your actual materials and labour rates, so professional quotes are faster and better grounded.',
    icon: FileText,
    targetClass: 'target-quotes',
  },
  {
    eyebrow: 'Bookings and deposits online',
    title: 'Win work while you are on the tools',
    body: 'Customers can book jobs and pay deposits through your public booking flow without needing an account.',
    icon: CalendarCheck,
    targetClass: 'target-bookings',
  },
]

const FEATURE_GROUPS = [
  {
    title: 'Winning Work & Quoting',
    items: [
      'Let customers book jobs and pay deposits online while you are on the tools.',
      'Draft professional quotes instantly using AI connected directly to your price list.',
      'See your exact gross profit while you quote, before you accidentally under-price a job.',
      'Customers can view and accept your quotes from a simple link without ever making an account.',
      'Automatically send quote follow-ups so you never lose a lead to a cold trail.',
    ],
  },
  {
    title: 'Mobile & On-Site',
    items: [
      'No cell signal? Keep tracking time, adding notes, and taking photos with true offline access.',
      'Get digital customer sign-offs and capture site photos before you even leave the driveway.',
      'Auto-track your GPS travel during trading hours so you never have to guess your mileage again.',
      'Your crew sees exactly what they need to do without getting lost in the office clutter.',
    ],
  },
  {
    title: 'Invoicing & Cash Flow',
    items: [
      'Convert completed jobs and timesheets into accurate invoices in just a few clicks.',
      'Get paid faster by letting customers pay online directly through Stripe.',
      'Stop chasing clients - let automated text and email reminders handle your overdue invoices.',
      'Keep bigger projects funded as the work progresses with simple progress invoicing.',
    ],
  },
  {
    title: 'Admin & Sanity',
    items: [
      'Replace the admin circus with one clean app for jobs, scheduling, and timesheets.',
      'Wake up to a daily AI to-do list that catches stale jobs and overdue bills before they cost you.',
      'Manage SMS threads, web enquiries, and booking requests from one single, unified inbox.',
      'Know exactly what is booked, who is assigned, and what stage it is at with customizable job statuses.',
    ],
  },
]

export function WelcomeTutorial({ initiallyOpen }: { initiallyOpen: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(initiallyOpen)
  const [phase, setPhase] = useState<'welcome' | 'tour' | 'features'>('welcome')
  const [step, setStep] = useState(0)
  const [seeding, setSeeding] = useState(false)
  const confetti = useMemo(() => Array.from({ length: 42 }, (_, i) => i), [])
  const current = STEPS[step]

  useEffect(() => {
    function replay() {
      setOpen(true)
      setPhase('welcome')
      setStep(0)
    }
    window.addEventListener('industryforms:replay-welcome-tutorial', replay)
    return () => window.removeEventListener('industryforms:replay-welcome-tutorial', replay)
  }, [])

  useEffect(() => {
    if (!open || phase !== 'welcome') return
    const t = window.setTimeout(() => setPhase('tour'), 4000)
    return () => window.clearTimeout(t)
  }, [open, phase])

  async function complete() {
    setOpen(false)
    await fetch('/api/tutorial/seen', { method: 'POST' }).catch(() => null)
  }

  // Apple Tap to Pay review requirement 3.4: the app must clearly show how
  // to enable Tap to Pay at the end of every new merchant onboarding
  // process. This welcome tutorial is that process — Stripe Connect payouts
  // (Settings → Integrations) is the actual gate Tap to Pay sits behind, so
  // that's where this sends them; the iPhone-side enable step happens once
  // they open the mobile app with payouts already live.
  async function goToTapToPaySetup() {
    setOpen(false)
    await fetch('/api/tutorial/seen', { method: 'POST' }).catch(() => null)
    router.push('/settings?tab=integrations')
  }

  // Opt-in demo data: seeds sample records across every module and flips the
  // account into test mode (caution-tape banner), reversible from Settings.
  async function loadDemoAndComplete() {
    setSeeding(true)
    await fetch('/api/test-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'enable' }),
    }).catch(() => null)
    setSeeding(false)
    setOpen(false)
    await fetch('/api/tutorial/seen', { method: 'POST' }).catch(() => null)
    window.location.reload()
  }

  function next() {
    if (phase === 'tour' && step < STEPS.length - 1) setStep(s => s + 1)
    else setPhase('features')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-white/45 backdrop-blur-[2px]">
      <button
        type="button"
        onClick={complete}
        className="absolute right-5 top-5 z-[102] inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/50 bg-white/45 text-gray-600 shadow-sm backdrop-blur-xl hover:bg-white/70"
        aria-label="Close tutorial"
      >
        <X className="h-4 w-4" />
      </button>

      {phase === 'welcome' ? (
        <div className="relative flex h-full items-center justify-center">
          <div className="welcome-popper left-[12%] top-[58%]" />
          <div className="welcome-popper right-[13%] top-[55%] rotate-180" />
          {confetti.map(i => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${8 + (i * 83) % 84}%`,
                animationDelay: `${(i % 10) * 0.12}s`,
                background: ['#f97316', '#0ea5e9', '#22c55e', '#eab308', '#ec4899'][i % 5],
              }}
            />
          ))}
          <div className="text-center">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/50 px-4 py-2 text-sm font-semibold text-[var(--accent,#f97316)] shadow-sm backdrop-blur-xl">
              <Sparkles className="h-4 w-4" /> IndustryForms
            </p>
            <h1 className="welcome-title text-6xl font-black tracking-normal text-gray-950 sm:text-8xl">Welcome</h1>
            <p className="mt-4 text-base font-medium text-gray-600">Let us show you where the good stuff lives.</p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
          <div className="liquid-glass grid w-full max-w-6xl gap-5 p-4 sm:grid-cols-[1.05fr_.95fr] sm:p-6">
            <div className="relative min-h-[520px] overflow-hidden rounded-2xl border border-white/40 bg-white/35 p-5 shadow-inner backdrop-blur-2xl">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Live walkthrough</p>
                  <h2 className="mt-1 text-2xl font-bold text-gray-950">How IndustryForms pays you back</h2>
                </div>
                <div className="rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-gray-500 shadow-sm">{phase === 'tour' ? `${step + 1}/${STEPS.length}` : 'Features'}</div>
              </div>

              <div className="relative h-[410px] rounded-2xl border border-white/40 bg-gray-950/5 p-4">
                <MockTile className="target-logbook left-[7%] top-[13%]" icon={Car} title="Vehicle log" text="Today: 42.8 km tracked" active={phase === 'tour' && current.targetClass === 'target-logbook'} />
                <MockTile className="target-invoices right-[7%] top-[18%]" icon={ReceiptText} title="Unpaid invoices" text="$4,820 overdue" active={phase === 'tour' && current.targetClass === 'target-invoices'} />
                <MockTile className="target-quotes left-[13%] bottom-[15%]" icon={FileText} title="AI quotes" text="Price-list grounded draft" active={phase === 'tour' && current.targetClass === 'target-quotes'} />
                <MockTile className="target-bookings right-[11%] bottom-[12%]" icon={CalendarCheck} title="Online bookings" text="Deposits paid upfront" active={phase === 'tour' && current.targetClass === 'target-bookings'} />

                {phase === 'tour' && (
                  <div className={`tutorial-arrow ${current.targetClass}`}>
                    <ArrowRight className="h-10 w-10" />
                  </div>
                )}
              </div>
            </div>

            {phase === 'tour' ? (
              <div className="flex min-h-[520px] flex-col justify-between rounded-2xl border border-white/45 bg-white/45 p-6 shadow-sm backdrop-blur-2xl">
                <div>
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent,#f97316)]/10 text-[var(--accent,#f97316)]">
                    <current.icon className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent,#f97316)]">{current.eyebrow}</p>
                  <h3 className="mt-3 text-3xl font-black tracking-normal text-gray-950">{current.title}</h3>
                  <p className="mt-4 text-base leading-7 text-gray-600">{current.body}</p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <button type="button" onClick={complete} className="text-sm font-semibold text-gray-500 hover:text-gray-800">Skip</button>
                  <button type="button" onClick={next} className="rounded-xl bg-[var(--accent,#f97316)] px-5 py-3 text-sm font-bold text-white shadow-sm hover:opacity-90">
                    {step === STEPS.length - 1 ? 'Show me the full list' : 'Next'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-h-[520px] overflow-y-auto rounded-2xl border border-white/45 bg-white/50 p-6 shadow-sm backdrop-blur-2xl">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent,#f97316)]">What makes it different</p>
                <h3 className="mt-3 text-3xl font-black tracking-normal text-gray-950">Built for work that moves</h3>
                <div className="mt-5 space-y-5">
                  {FEATURE_GROUPS.map(group => (
                    <section key={group.title}>
                      <h4 className="mb-2 text-base font-bold text-gray-950">{group.title}</h4>
                      <ul className="space-y-2">
                        {group.items.map(item => (
                          <li key={item} className="flex gap-2 text-sm leading-6 text-gray-600">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent,#f97316)]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
                <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--accent,#f97316)]/30 bg-[var(--accent,#f97316)]/5 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent,#f97316)]/10 text-[var(--accent,#f97316)]">
                    <CreditCard className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-950">Take card payments in person</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">Connect Stripe once, then tap a customer&apos;s card on your iPhone with Tap to Pay — no card reader needed.</p>
                    <button type="button" onClick={goToTapToPaySetup} className="mt-2 text-xs font-bold text-[var(--accent,#f97316)] hover:opacity-80">
                      Set up payouts →
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <button type="button" onClick={loadDemoAndComplete} disabled={seeding} className="w-full rounded-xl border border-[var(--accent,#f97316)] bg-[var(--accent,#f97316)]/10 px-5 py-3 text-sm font-bold text-[var(--accent,#f97316)] shadow-sm hover:bg-[var(--accent,#f97316)]/15 disabled:opacity-60">
                    {seeding ? 'Loading demo data…' : 'Explore with sample data first'}
                  </button>
                  <button type="button" onClick={complete} disabled={seeding} className="w-full rounded-xl bg-gray-950 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-gray-800 disabled:opacity-60">
                    Start with a clean account
                  </button>
                  <p className="text-center text-xs text-gray-400">Sample data drops customers, jobs and invoices in so you can look around — clear it anytime from Settings.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .welcome-title {
          animation: welcome-float 2.8s ease-in-out infinite;
          text-shadow: 0 18px 50px rgba(249, 115, 22, 0.22);
        }
        .confetti-piece {
          position: absolute;
          top: -24px;
          width: 10px;
          height: 18px;
          border-radius: 3px;
          opacity: 0;
          animation: confetti-fall 3.8s ease-in forwards;
        }
        .welcome-popper {
          position: absolute;
          width: 96px;
          height: 96px;
          border-radius: 999px;
          background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.9), rgba(249,115,22,.22) 42%, transparent 70%);
          filter: blur(.2px);
          animation: popper-pulse 1.3s ease-in-out infinite;
        }
        .liquid-glass {
          border: 1px solid rgba(255,255,255,.58);
          border-radius: 28px;
          background:
            radial-gradient(circle at 12% 12%, rgba(255,255,255,.95), transparent 28%),
            linear-gradient(135deg, rgba(255,255,255,.56), rgba(255,255,255,.2));
          box-shadow: 0 30px 90px rgba(15,23,42,.2), inset 0 1px 0 rgba(255,255,255,.7);
          backdrop-filter: blur(26px) saturate(1.35);
        }
        .tutorial-arrow {
          position: absolute;
          color: var(--accent, #f97316);
          filter: drop-shadow(0 10px 20px rgba(249,115,22,.3));
          transition: left .65s cubic-bezier(.2,.8,.2,1), top .65s cubic-bezier(.2,.8,.2,1), transform .65s cubic-bezier(.2,.8,.2,1);
          animation: arrow-nudge 1.1s ease-in-out infinite;
        }
        .tutorial-arrow.target-logbook { left: 31%; top: 25%; transform: rotate(-18deg); }
        .tutorial-arrow.target-invoices { left: 58%; top: 29%; transform: rotate(8deg); }
        .tutorial-arrow.target-quotes { left: 34%; top: 68%; transform: rotate(-10deg); }
        .tutorial-arrow.target-bookings { left: 58%; top: 69%; transform: rotate(8deg); }
        @keyframes welcome-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.015); }
        }
        @keyframes confetti-fall {
          0% { opacity: 0; transform: translateY(-10vh) rotate(0deg); }
          12% { opacity: 1; }
          100% { opacity: 0; transform: translateY(112vh) rotate(560deg); }
        }
        @keyframes popper-pulse {
          0%, 100% { transform: scale(.92); opacity: .62; }
          50% { transform: scale(1.08); opacity: .95; }
        }
        @keyframes arrow-nudge {
          0%, 100% { margin-left: 0; }
          50% { margin-left: 9px; }
        }
      `}</style>
    </div>
  )
}

function MockTile({ className, icon: Icon, title, text, active }: { className: string; icon: typeof Car; title: string; text: string; active: boolean }) {
  return (
    <div className={`absolute w-[38%] rounded-2xl border p-4 shadow-sm transition-all duration-500 ${className} ${active ? 'scale-[1.04] border-[var(--accent,#f97316)]/40 bg-white/80 shadow-xl' : 'border-white/50 bg-white/45'}`}>
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-950/5 text-gray-700">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-gray-950">{title}</p>
      <p className="mt-1 text-xs text-gray-500">{text}</p>
    </div>
  )
}
