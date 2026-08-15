'use client'
// Shown when a job has been invoiced to its full quoted amount. The DB
// trigger (migration 20260815100000) is the real enforcement — this is
// discovery (so it's not a surprise when an edit is blocked) plus the one
// escape hatch (jobs.invoice_lock_override), which is the only column that
// trigger always permits regardless of lock state.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Lock, LockOpen } from 'lucide-react'

export function JobLockBanner({ jobId, locked, overridden, role }: {
  jobId: string
  /** True once fully invoiced and not overridden — mirrors invoiceGuard()'s 'fully-invoiced' branch, computed server-side. */
  locked: boolean
  /** True if an owner/admin has already unlocked this job. */
  overridden: boolean
  role: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const canUnlock = role === 'owner' || role === 'admin'

  if (!locked && !overridden) return null

  async function toggle(next: boolean) {
    if (!canUnlock) return
    if (next && !confirm('Unlock this job? It will become editable again even though it has been invoiced in full.')) return
    setLoading(true)
    const { error } = await supabase.from('jobs').update({ invoice_lock_override: next }).eq('id', jobId)
    setLoading(false)
    if (error) { toast(error.message, 'error'); return }
    toast(next ? 'Job unlocked' : 'Job re-locked')
    router.refresh()
  }

  if (overridden) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <LockOpen className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">Unlocked by an admin — this job is editable even though it&apos;s invoiced in full.</p>
        </div>
        {canUnlock && <Button size="sm" variant="outline" loading={loading} onClick={() => toggle(false)}>Re-lock</Button>}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-gray-500 shrink-0" />
        <p className="text-sm text-gray-700">This job has been invoiced in full and is locked. Only messages can still be added.</p>
      </div>
      {canUnlock && <Button size="sm" variant="outline" loading={loading} onClick={() => toggle(true)}>Unlock</Button>}
    </div>
  )
}
