'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Undo2 } from 'lucide-react'

// Sits next to the prev/next arrows. Only unpaid draft invoices linked to a job
// can be reverted — deletes the draft invoice and returns to the job.
export function RevertToJobButton({ invoiceId, jobId, status, amountPaid }: {
  invoiceId: string
  jobId: string | null
  status: string
  amountPaid: number
}) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  if (!jobId || status !== 'draft' || amountPaid > 0) return null

  async function revert() {
    if (!confirm('Revert back to the job? This will delete the draft invoice and keep the job.')) return
    setLoading(true)
    await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId)
    await supabase.from('invoices').delete().eq('id', invoiceId)
    toast('Invoice reverted back to job')
    router.push(`/jobs/${jobId}`)
  }

  return (
    <Button variant="ghost" size="sm" loading={loading} onClick={revert}>
      <Undo2 className="h-4 w-4" /> Revert back to job
    </Button>
  )
}
