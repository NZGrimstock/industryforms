'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'

interface Props {
  companyId: string
  customers: { id: string; name: string }[]
  team: { id: string; full_name: string }[]
}

// Default stage template used to bootstrap a new project — small enough to be
// helpful, generic enough to suit most renovation / build / fitout flows.
const DEFAULT_STAGES = ['Planning & design', 'Materials & ordering', 'Site prep', 'Construction', 'Finishing & sign-off']

export function NewProjectButton({ companyId, customers, team }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [form, setForm] = useState({
    name: '', customer_id: '', project_manager_id: '', description: '',
    total_budget: '', start_date: '', target_end_date: '',
  })

  async function save() {
    if (!form.name.trim()) return
    setLoading(true)
    const { data: project, error } = await supabase.from('projects').insert({
      company_id: companyId, name: form.name.trim(),
      customer_id: form.customer_id || null,
      project_manager_id: form.project_manager_id || null,
      description: form.description || null,
      total_budget: form.total_budget ? parseFloat(form.total_budget) : null,
      start_date: form.start_date || null, target_end_date: form.target_end_date || null,
      status: 'planning',
    }).select('id').single()
    if (error || !project) { toast(error?.message ?? 'Could not create project', 'error'); setLoading(false); return }
    // Seed with the default stages so the user lands on a useful page, not a blank slate.
    await supabase.from('project_stages').insert(
      DEFAULT_STAGES.map((name, i) => ({ project_id: project.id, name, sort_order: i, status: 'pending' }))
    )
    toast('Project created')
    setOpen(false)
    router.push(`/projects/${project.id}`)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New project
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New project">
        <form onSubmit={e => { e.preventDefault(); save() }} className="space-y-4">
          <div>
            <Label>Project name <span className="text-red-400">*</span></Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kitchen renovation — 24 Park Ave" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Customer</Label>
              <Select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} placeholder="None"
                options={customers.map(c => ({ value: c.id, label: c.name }))} /></div>
            <div><Label>Project manager</Label>
              <Select value={form.project_manager_id} onChange={e => setForm(f => ({ ...f, project_manager_id: e.target.value }))} placeholder="Unassigned"
                options={team.map(t => ({ value: t.id, label: t.full_name }))} /></div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional scope / notes" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Budget ($)</Label><Input type="number" step="0.01" value={form.total_budget} onChange={e => setForm(f => ({ ...f, total_budget: e.target.value }))} /></div>
            <div><Label>Start date</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            <div><Label>Target end</Label><Input type="date" value={form.target_end_date} onChange={e => setForm(f => ({ ...f, target_end_date: e.target.value }))} /></div>
          </div>
          <p className="text-xs text-gray-400">A starter set of stages will be added — you can rename/reorder/delete them on the project page.</p>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={loading}>Create project</Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
