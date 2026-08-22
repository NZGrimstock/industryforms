'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FolderKanban, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

interface ProjectOption { id: string; name: string }

interface Props {
  jobId: string
  currentProjectId: string | null
  currentProjectName: string | null
  projects: ProjectOption[]
}

// Mirrors JobSiteSelector's inline-edit-via-dialog pattern. Switching project
// clears project_stage_id — a stage belongs to the old project and has no
// meaning under the new one.
export function JobProjectSelector({ jobId, currentProjectId, currentProjectName, projects }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(currentProjectId ?? '')
  const [saving, setSaving] = useState(false)

  if (projects.length === 0 && !currentProjectId) return null

  async function save() {
    setSaving(true)
    const projectId = selected || null
    const payload: { project_id: string | null; project_stage_id?: null } = { project_id: projectId }
    if (projectId !== currentProjectId) payload.project_stage_id = null
    const { error } = await supabase.from('jobs').update(payload).eq('id', jobId)
    if (error) { toast(error.message, 'error'); setSaving(false); return }
    toast('Project updated')
    setOpen(false)
    setSaving(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 group mt-1"
      >
        <FolderKanban className="h-3.5 w-3.5 shrink-0" />
        {currentProjectName
          ? <span>{currentProjectName}</span>
          : <span className="text-gray-400 italic">No project</span>
        }
        <Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Attach to project">
        <div className="space-y-4">
          <div className="space-y-2 max-h-80 overflow-auto">
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input type="radio" name="project" checked={selected === ''} onChange={() => setSelected('')} />
              <span className="text-sm text-gray-500 italic">No project</span>
            </label>
            {projects.map(p => (
              <label key={p.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <input type="radio" name="project" checked={selected === p.id} onChange={() => setSelected(p.id)} />
                <span className="text-sm text-gray-700">{p.name}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-3 pt-1">
            <Button onClick={save} loading={saving}>Save</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
