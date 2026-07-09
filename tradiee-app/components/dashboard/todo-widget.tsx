'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Circle, Plus, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useTimezone } from '@/components/providers/timezone-provider'
import { formatDate } from '@/lib/datetime'

type Todo = {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  job_id: string | null
  jobs?: { job_number: string; title: string } | null
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  medium: 'bg-blue-400',
  low: 'bg-gray-300',
}

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

export function TodoWidget({
  todos: initial,
  userId,
  companyId,
}: {
  todos: Todo[]
  userId: string
  companyId: string
}) {
  const supabase = createClient()
  const router = useRouter()
  const timezone = useTimezone()
  const [todos, setTodos] = useState(initial)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function complete(id: string) {
    setCompleting(id)
    await supabase.from('todos').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
    setCompleting(null)
    startTransition(() => router.refresh())
  }

  async function addTodo() {
    if (!newTitle.trim()) return
    setAdding(true)
    const { data } = await supabase.from('todos').insert({
      title: newTitle.trim(),
      company_id: companyId,
      assigned_to: userId,
      created_by: userId,
      status: 'pending',
      priority: 'medium',
    }).select('id, title, status, priority, due_date, job_id').single()
    if (data) setTodos(prev => [...prev, { ...data, jobs: null }])
    setNewTitle('')
    setShowAdd(false)
    setAdding(false)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">To-Do</h2>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="inline-flex items-center gap-1 text-xs text-[var(--accent,#f97316)] hover:opacity-80 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      <CardContent className="p-0">
        {showAdd && (
          <div className="px-6 py-3 border-b border-gray-50 flex items-center gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTodo(); if (e.key === 'Escape') setShowAdd(false) }}
              placeholder="New to-do item…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-orange-300"
            />
            <button
              onClick={addTodo}
              disabled={adding || !newTitle.trim()}
              className="text-xs font-semibold text-white bg-[var(--accent,#f97316)] rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </button>
          </div>
        )}

        {todos.length === 0 && !showAdd ? (
          <p className="text-sm text-gray-400 text-center py-8">Nothing to do — enjoy the day!</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {todos.map(t => {
              const overdue = isOverdue(t.due_date)
              return (
                <li key={t.id} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 group">
                  <button
                    onClick={() => complete(t.id)}
                    className="shrink-0 text-gray-300 hover:text-green-500 transition-colors"
                    disabled={completing === t.id}
                  >
                    {completing === t.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      : <Circle className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-gray-800">{t.title}</span>
                    {t.jobs && (
                      <Link
                        href={`/jobs/${t.job_id}`}
                        className="ml-2 text-xs text-orange-500 hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        {t.jobs.job_number}
                      </Link>
                    )}
                    {t.due_date && (
                      <span className={`ml-2 text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {overdue ? 'Overdue · ' : ''}{formatDate(t.due_date, timezone, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <div className={`shrink-0 w-2 h-2 rounded-full ${PRIORITY_DOT[t.priority] ?? 'bg-gray-200'}`} title={t.priority} />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
