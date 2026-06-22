'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { type JobStatus, jobStatusBoardBg, jobStatusBoardText } from '@/lib/job-statuses'
import { User, Calendar } from 'lucide-react'
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable,
} from '@dnd-kit/core'

type Job = {
  id: string
  job_number: string
  title: string
  status: string
  created_at: string
  customers: { name: string } | null
  profiles: { full_name: string } | null
  customer_sites: { address: string } | null
}

type Column = { key: string; label: string; color: string; bg: string }

function JobCard({ job, isDragging = false }: { job: Job; isDragging?: boolean }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl p-3 shadow-sm ${isDragging ? 'opacity-40 shadow-lg rotate-1' : 'hover:border-[var(--accent,#f97316)]/40 hover:shadow'} transition-all cursor-grab active:cursor-grabbing`}>
      <div className="flex items-start justify-between gap-1 mb-2">
        <span className="text-xs font-semibold text-orange-500">{job.job_number}</span>
      </div>
      <p className="text-sm font-medium text-gray-900 leading-tight mb-2 line-clamp-2">{job.title}</p>
      {job.customers && (
        <p className="text-xs text-gray-500 truncate mb-1">{job.customers.name}</p>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
        {job.profiles ? (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <User className="h-3 w-3" />{job.profiles.full_name.split(' ')[0]}
          </span>
        ) : <span />}
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <Calendar className="h-3 w-3" />{formatDate(job.created_at)}
        </span>
      </div>
    </div>
  )
}

function DraggableJobCard({ job }: { job: Job }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: job.id, data: { job } })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <Link href={`/jobs/${job.id}`} onClick={e => { if (isDragging) e.preventDefault() }}>
        <JobCard job={job} isDragging={isDragging} />
      </Link>
    </div>
  )
}

function BoardColumn({ column, jobs }: { column: Column; jobs: Job[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })
  return (
    <div className="flex-1 min-w-[200px]">
      <div className={`flex items-center justify-between mb-3 px-1`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${column.color}`}>{column.label}</span>
        <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{jobs.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[300px] rounded-xl p-2 space-y-2 transition-colors ${isOver ? 'bg-orange-50 ring-2 ring-orange-300' : column.bg}`}
      >
        {jobs.map(j => <DraggableJobCard key={j.id} job={j} />)}
        {jobs.length === 0 && (
          <div className="flex items-center justify-center h-24 text-xs text-gray-300">
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

export function JobBoard({ initialJobs, statuses }: { initialJobs: Job[]; statuses: JobStatus[] }) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [activeJob, setActiveJob] = useState<Job | null>(null)
  const supabase = createClient()

  const columns: Column[] = statuses.map(s => ({ key: s.key, label: s.label, color: jobStatusBoardText(s.color), bg: jobStatusBoardBg(s.color) }))

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragStart(e: DragStartEvent) {
    setActiveJob(e.active.data.current?.job as Job ?? null)
  }

  const handleDragEnd = useCallback(async (e: DragEndEvent) => {
    setActiveJob(null)
    const { active, over } = e
    if (!over) return
    const job = active.data.current?.job as Job
    const newStatus = over.id as string
    if (!job || job.status === newStatus) return

    setJobs(js => js.map(j => j.id === job.id ? { ...j, status: newStatus } : j))
    await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id)
  }, [supabase])

  const visibleCols = columns.filter(c => c.key !== 'cancelled')
  const cancelledCount = jobs.filter(j => j.status === 'cancelled').length

  return (
    <div>
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {visibleCols.map(col => (
              <BoardColumn key={col.key} column={col} jobs={jobs.filter(j => j.status === col.key)} />
            ))}
            <DragOverlay>
              {activeJob && <div className="w-52"><JobCard job={activeJob} /></div>}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
      {cancelledCount > 0 && (
        <p className="text-xs text-gray-400 mt-2">{cancelledCount} cancelled job{cancelledCount !== 1 ? 's' : ''} hidden</p>
      )}
    </div>
  )
}
