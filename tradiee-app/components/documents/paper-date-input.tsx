'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import { cn, formatDate } from '@/lib/utils'
import { PAPER_INPUT } from './paper'

// A date printed on a paper document that can be changed in place while the
// document is still editable (draft invoice / draft PO). Saves on change.
// When not editable it renders as plain printed text.
export function PaperDateInput({ table, id, column, value, editable, label }: {
  table: 'invoices' | 'purchase_orders'
  id: string
  column: string
  value: string | null
  editable: boolean
  label: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [v, setV] = useState((value ?? '').slice(0, 10))

  if (!editable) return <>{value ? formatDate(value) : '—'}</>

  async function save(next: string) {
    setV(next)
    const { error } = await createClient().from(table).update({ [column]: next || null }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    router.refresh()
  }

  return (
    <input
      type="date"
      aria-label={label}
      value={v}
      onChange={e => save(e.target.value)}
      className={cn(PAPER_INPUT, 'py-0 font-bold')}
    />
  )
}
