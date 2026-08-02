'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import { ShoppingCart, Loader2 } from 'lucide-react'

// Creates one draft PO per supplier from the job's materials, then opens them
// one after the other. Idempotent server-side: if the job already has POs it
// just reopens them rather than duplicating.
export function OrderMaterialsButton({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function order() {
    setLoading(true)
    try {
      const res = await fetch('/api/purchase-orders/from-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not create purchase orders')
      router.push(`/purchase-orders/from-job/${jobId}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create purchase orders', 'error')
      setLoading(false)
    }
  }

  return (
    <button
      onClick={order}
      disabled={loading || disabled}
      title={disabled ? 'Add materials to this job first' : 'Create purchase orders for these materials'}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent,#f97316)] hover:underline disabled:opacity-40 disabled:no-underline"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5" />}
      Order materials
    </button>
  )
}
