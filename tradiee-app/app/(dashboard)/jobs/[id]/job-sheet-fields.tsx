'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { PAPER_INPUT } from '@/components/documents/paper'

// Job title / description printed on the job sheet, edited in place. Saves when
// focus leaves the field. Read-only while the job is locked (fully invoiced);
// the lock_job_once_fully_invoiced trigger rejects the write anyway, this just
// avoids offering an edit that will fail.
export function JobSheetField({ jobId, field, value, locked }: {
  jobId: string
  field: 'title' | 'description'
  value: string | null
  locked: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [v, setV] = useState(value ?? '')
  const [savedValue, setSavedValue] = useState(value ?? '')

  async function save() {
    const next = field === 'title' ? v.trim() : v
    if (next === savedValue) return
    if (field === 'title' && !next) { toast('A job needs a title', 'error'); setV(savedValue); return }
    const { error } = await createClient().from('jobs').update({ [field]: next || null }).eq('id', jobId)
    if (error) { toast(error.message, 'error'); setV(savedValue); return }
    setSavedValue(next)
    router.refresh()
  }

  if (field === 'title') {
    return (
      <input
        aria-label="Job title"
        readOnly={locked}
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={cn(PAPER_INPUT, 'mb-3 text-base font-bold')}
      />
    )
  }
  return (
    <textarea
      aria-label="Description of work"
      readOnly={locked}
      rows={Math.min(8, Math.max(3, v.split('\n').length + 1))}
      value={v}
      onChange={e => setV(e.target.value)}
      onBlur={save}
      placeholder={locked ? '' : 'Describe the work to be done…'}
      className={cn(PAPER_INPUT, 'block resize-y leading-[1.55]')}
    />
  )
}
