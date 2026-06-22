'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, FolderKanban, Users, Layers, FileText, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

const BENEFITS = [
  { icon: Layers,        text: 'Break a build into stages with completion targets' },
  { icon: FileText,      text: 'Link jobs and invoices to each stage' },
  { icon: Users,         text: 'Track subcontractors and project contacts in one place' },
  { icon: CheckCircle2,  text: 'See live % complete per project on a single board' },
]

export function ProjectsUpsell() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function enable() {
    if (!confirm('Enable the Projects add-on for $19/mo (NZD)? You can disable it any time from Settings → Billing.')) return
    setLoading(true)
    const res = await fetch('/api/billing/addon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'projects', active: true }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { toast(data.error ?? 'Could not enable', 'error'); return }
    toast('Projects add-on enabled')
    router.refresh()
  }

  return (
    <div className="p-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-50 px-8 py-10 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-white shadow-sm">
              <FolderKanban className="h-5 w-5" />
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 bg-white/70 px-2 py-1 rounded-full">
              <Sparkles className="h-3 w-3" /> Add-on
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Projects</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">For renovations, builds and fitouts that span weeks and many jobs. Group the work, track the stages, see where you stand.</p>
        </div>
        <CardContent className="py-8 px-8">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8 mb-8">
            {BENEFITS.map(b => (
              <li key={b.text} className="flex items-start gap-3 text-sm text-gray-700">
                <b.icon className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <span>{b.text}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-100">
            <div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">$19<span className="text-sm font-medium text-gray-400">/mo NZD</span></p>
              <p className="text-xs text-gray-400">Add-on to any paid plan. Cancel any time.</p>
            </div>
            <Button onClick={enable} loading={loading}>Enable Projects</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
