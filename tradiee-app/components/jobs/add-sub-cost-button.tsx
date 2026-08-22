'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

interface Props {
  jobLinkId: string
  contractorJobId: string
  contractorCompanyId: string
  profileId: string
  description: string
  agreedPrice: number
  costCategoryId: string | null
}

// Bill-through billing bridge: pulls the invitation's agreed price onto the
// contractor's job as a normal job_materials line (Subcontractors cost
// category), the same row type the Materials card already invoices from —
// no separate billing path needed. Direct-to-client billing (the sub
// invoices the homeowner themselves) isn't this — see PROJECT_STATE.md.
export function AddSubCostButton({ jobLinkId, contractorJobId, contractorCompanyId, profileId, description, agreedPrice, costCategoryId }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  async function addCost() {
    setSaving(true)
    const { data: material, error } = await supabase.from('job_materials').insert({
      job_id: contractorJobId,
      company_id: contractorCompanyId,
      added_by: profileId,
      description,
      quantity: 1,
      unit: 'job',
      unit_cost: agreedPrice,
      unit_price: agreedPrice,
      cost_category_id: costCategoryId,
    }).select('id').single()
    if (error || !material) { toast(error?.message ?? 'Could not add job cost', 'error'); setSaving(false); return }

    const { error: linkErr } = await supabase.from('job_links').update({ contractor_material_id: material.id }).eq('id', jobLinkId)
    if (linkErr) { toast(linkErr.message, 'error'); setSaving(false); return }

    toast('Added to job cost — edit the price/markup in Materials before invoicing')
    router.refresh()
  }

  return (
    <Button type="button" size="sm" variant="outline" loading={saving} onClick={addCost}>
      <PlusCircle className="h-3.5 w-3.5" /> Add to job cost
    </Button>
  )
}
