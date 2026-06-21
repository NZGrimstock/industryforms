'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, CheckSquare, Square } from 'lucide-react'

type Task = { id: string; title: string; is_done: boolean }

export function JobTasksCard({ jobId, companyId }: { jobId: string; companyId: string }) {
  const supabase = createClient()
  const { toast } = useToast()
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('job_tasks').select('id, title, is_done').eq('job_id', jobId).order('sort_order').order('created_at')
    setTasks((data ?? []) as Task[])
  }, [supabase, jobId])
  useEffect(() => { load() }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setAdding(true)
    const { error } = await supabase.from('job_tasks').insert({ job_id: jobId, company_id: companyId, title: title.trim(), sort_order: tasks.length })
    setAdding(false)
    if (error) { toast(error.message, 'error'); return }
    setTitle(''); load()
  }
  async function toggle(t: Task) {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, is_done: !x.is_done } : x))
    await supabase.from('job_tasks').update({ is_done: !t.is_done }).eq('id', t.id)
  }
  async function remove(id: string) {
    setTasks(prev => prev.filter(x => x.id !== id))
    await supabase.from('job_tasks').delete().eq('id', id)
  }

  const done = tasks.filter(t => t.is_done).length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><CheckSquare className="h-4 w-4 text-gray-400" /> Tasks</CardTitle>
        {tasks.length > 0 && <span className="text-xs text-gray-400">{done}/{tasks.length} done</span>}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2.5 group">
            <button onClick={() => toggle(t)} className={t.is_done ? 'text-green-500' : 'text-gray-300 hover:text-gray-500'}>
              {t.is_done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </button>
            <span className={`flex-1 text-sm ${t.is_done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{t.title}</span>
            <button onClick={() => remove(t.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-sm text-gray-400">No tasks yet.</p>}
        <form onSubmit={add} className="flex gap-2 pt-2">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a task…" className="h-8 text-sm" />
          <button type="submit" disabled={adding || !title.trim()} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-gray-100 hover:bg-gray-200 px-3 text-sm text-gray-600 disabled:opacity-50"><Plus className="h-4 w-4" /></button>
        </form>
      </CardContent>
    </Card>
  )
}
