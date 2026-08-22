'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Users, X, Plus } from 'lucide-react'

type Assignee = { id: string; profile_id: string; profiles: { full_name: string; job_title?: string | null } }
type TeamMember = { id: string; full_name: string }

interface Props {
  jobId: string
  companyId: string
  assignees: Assignee[]
  team: TeamMember[]
}

export function JobAssigneesCard({ jobId, assignees: initial, team }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [assignees, setAssignees] = useState(initial)
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(false)

  const assignedIds = new Set(assignees.map(a => a.profile_id))
  const available = team.filter(m => !assignedIds.has(m.id))

  async function add(profileId: string) {
    setLoading(true)
    const { data } = await supabase.from('job_assignees')
      .insert({ job_id: jobId, profile_id: profileId })
      .select('id, profile_id, profiles(full_name, job_title)')
      .single()
    if (data) setAssignees(prev => [...prev, data as unknown as Assignee])
    setAdding(false)
    setLoading(false)
    router.refresh()
  }

  async function remove(id: string) {
    await supabase.from('job_assignees').delete().eq('id', id)
    setAssignees(prev => prev.filter(a => a.id !== id))
    router.refresh()
  }

  if (assignees.length === 0 && available.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Additional workers</CardTitle>
          {available.length > 0 && !adding && (
            <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-xs text-[var(--accent,#f97316)] hover:underline font-medium">
              <Plus className="h-3.5 w-3.5" /> Assign
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {assignees.length === 0 && (
          <p className="text-sm text-gray-400 px-6 py-3">No additional workers assigned</p>
        )}
        {assignees.length > 0 && (
          <ul className="divide-y divide-gray-50">
            {assignees.map(a => (
              <li key={a.id} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{a.profiles.full_name}</p>
                    {a.profiles.job_title && <p className="text-xs text-gray-400">{a.profiles.job_title}</p>}
                  </div>
                </div>
                <button onClick={() => remove(a.id)} className="text-gray-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {adding && (
          <div className="px-6 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Select a team member to assign:</p>
            <div className="flex flex-wrap gap-2">
              {available.map(m => (
                <button key={m.id} onClick={() => add(m.id)} disabled={loading}
                  className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[var(--accent,#f97316)] hover:text-[var(--accent,#f97316)] disabled:opacity-50">
                  {m.full_name}
                </button>
              ))}
            </div>
            <button onClick={() => setAdding(false)} className="mt-2 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
