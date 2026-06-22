'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, Check, Circle, Clock, AlertTriangle, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type Profile = { id: string; full_name: string }
type Job = { id: string; job_number: string; title: string }
type Todo = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_date: string | null
  assigned_to: string | null
  job_id: string | null
  profiles: { full_name: string } | null
  jobs: { job_number: string; title: string } | null
}

interface Props {
  todos: Todo[]
  companyId: string
  profileId: string
  team: Profile[]
  jobs: Job[]
  currentStatus?: string
  mineOnly: boolean
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent']
const STATUSES = ['pending', 'in_progress', 'done']

const priorityColors: Record<string, string> = {
  low: 'text-gray-400',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
}

const PriorityIcon = ({ p }: { p: string }) => {
  if (p === 'urgent') return <AlertTriangle className={cn('h-3.5 w-3.5', priorityColors[p])} />
  if (p === 'high') return <AlertTriangle className={cn('h-3.5 w-3.5', priorityColors[p])} />
  return <Circle className={cn('h-3.5 w-3.5', priorityColors[p])} />
}

export function TodoClient({ todos, companyId, profileId, team, jobs, currentStatus, mineOnly }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [newOpen, setNewOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assigned_to: profileId,
    due_date: '',
    job_id: '',
  })

  async function createTodo() {
    if (!form.title.trim()) return
    setLoading(true)
    await supabase.from('todos').insert({
      company_id: companyId,
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      assigned_to: form.assigned_to || null,
      created_by: profileId,
      due_date: form.due_date || null,
      job_id: form.job_id || null,
    })
    setLoading(false)
    setNewOpen(false)
    setForm({ title: '', description: '', priority: 'medium', assigned_to: profileId, due_date: '', job_id: '' })
    router.refresh()
  }

  async function toggleStatus(todo: Todo) {
    const next = todo.status === 'done' ? 'pending' : todo.status === 'pending' ? 'in_progress' : 'done'
    await supabase.from('todos').update({
      status: next,
      completed_at: next === 'done' ? new Date().toISOString() : null,
    }).eq('id', todo.id)
    router.refresh()
  }

  async function deleteTodo(id: string) {
    await supabase.from('todos').delete().eq('id', id)
    router.refresh()
  }

  const grouped = {
    urgent: todos.filter(t => t.priority === 'urgent' && t.status !== 'done'),
    high: todos.filter(t => t.priority === 'high' && t.status !== 'done'),
    medium: todos.filter(t => t.priority === 'medium' && t.status !== 'done'),
    low: todos.filter(t => t.priority === 'low' && t.status !== 'done'),
    done: todos.filter(t => t.status === 'done'),
  }

  const isShowingDone = currentStatus === 'done'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1">
          <Link href="/todos" className={`px-3 py-1.5 text-xs font-medium rounded-full ${!currentStatus ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Active</Link>
          <Link href="/todos?status=done" className={`px-3 py-1.5 text-xs font-medium rounded-full ${currentStatus === 'done' ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Done</Link>
          <Link href={mineOnly ? '/todos' : '/todos?mine=1'} className={`px-3 py-1.5 text-xs font-medium rounded-full ${mineOnly ? 'bg-[var(--accent,#f97316)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Mine</Link>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-2 bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <Plus className="h-4 w-4" /> New task
        </button>
      </div>

      {isShowingDone ? (
        <TodoList todos={todos} onToggle={toggleStatus} onDelete={deleteTodo} showDone />
      ) : (
        <div className="space-y-6">
          {(['urgent', 'high', 'medium', 'low'] as const).map(p => {
            const items = grouped[p]
            if (!items.length) return null
            return (
              <div key={p}>
                <div className="flex items-center gap-2 mb-2">
                  <PriorityIcon p={p} />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide capitalize">{p}</span>
                  <span className="text-xs text-gray-400">({items.length})</span>
                </div>
                <TodoList todos={items} onToggle={toggleStatus} onDelete={deleteTodo} />
              </div>
            )
          })}
          {todos.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Check className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tasks — you&apos;re all caught up!</p>
            </div>
          )}
        </div>
      )}

      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>New task</CardTitle>
                <button onClick={() => setNewOpen(false)}><X className="h-4 w-4 text-gray-400" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Task *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="What needs to be done?"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && createTodo()}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400 resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400 capitalize" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Due date</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Assign to</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {team.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Linked job</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-orange-400" value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}>
                    <option value="">None</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setNewOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={createTodo} disabled={loading || !form.title.trim()} className="px-4 py-2 text-sm bg-[var(--accent,#f97316)] hover:bg-[var(--accent-hover,#ea580c)] text-white rounded-lg disabled:opacity-50">
                  {loading ? 'Saving…' : 'Add task'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function TodoList({ todos, onToggle, onDelete, showDone }: {
  todos: Todo[]
  onToggle: (t: Todo) => void
  onDelete: (id: string) => void
  showDone?: boolean
}) {
  return (
    <div className="space-y-1.5">
      {todos.map(todo => {
        const isOverdue = todo.due_date && new Date(todo.due_date) < new Date() && todo.status !== 'done'
        return (
          <div key={todo.id} className={cn('flex items-start gap-3 p-3 rounded-xl border bg-white group', todo.status === 'done' ? 'opacity-60' : '')}>
            <button
              onClick={() => onToggle(todo)}
              className={cn('mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors', todo.status === 'done' ? 'bg-green-500 border-green-500' : todo.status === 'in_progress' ? 'border-orange-400' : 'border-gray-300 hover:border-orange-400')}
            >
              {todo.status === 'done' && <Check className="h-3 w-3 text-white" />}
              {todo.status === 'in_progress' && <div className="w-2 h-2 rounded-full bg-orange-400" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm text-gray-800', todo.status === 'done' && 'line-through text-gray-400')}>{todo.title}</p>
              {todo.description && <p className="text-xs text-gray-400 mt-0.5">{todo.description}</p>}
              <div className="flex items-center gap-2 mt-1">
                {todo.due_date && (
                  <span className={cn('text-xs', isOverdue ? 'text-red-500 font-medium' : 'text-gray-400')}>
                    <Clock className="inline h-3 w-3 mr-0.5" />
                    {isOverdue ? 'Overdue · ' : ''}{formatDate(todo.due_date)}
                  </span>
                )}
                {todo.profiles && <span className="text-xs text-gray-400">{todo.profiles.full_name}</span>}
                {todo.jobs && (
                  <Link href={`/jobs/${todo.job_id}`} className="text-xs text-orange-500 hover:underline">
                    {todo.jobs.job_number}
                  </Link>
                )}
              </div>
            </div>
            <button
              onClick={() => onDelete(todo.id)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
