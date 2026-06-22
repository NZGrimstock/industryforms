'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { formatDateTime } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// Deterministic colour per staff member
const STAFF_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', sub: 'text-blue-600', dot: 'bg-blue-400' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', sub: 'text-purple-600', dot: 'bg-purple-400' },
  { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', sub: 'text-green-600', dot: 'bg-green-400' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-800', sub: 'text-pink-600', dot: 'bg-pink-400' },
  { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', sub: 'text-teal-600', dot: 'bg-teal-400' },
  { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', sub: 'text-[var(--accent,#f97316)]', dot: 'bg-orange-400' },
]

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'

interface Visit {
  id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string | null
  jobs: { id: string; job_number: string; title: string; customers: { name: string } | null } | null
  profiles: { id: string; full_name: string } | null
}

interface TeamMember { id: string; full_name: string }

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
}

function VisitCard({ visit, colorIdx = 5, isDragging = false }: { visit: Visit; colorIdx?: number; isDragging?: boolean }) {
  const c = STAFF_COLORS[colorIdx % STAFF_COLORS.length]
  return (
    <div className={`${c.bg} border ${c.border} rounded-lg p-2 ${isDragging ? 'opacity-50' : ''} transition-colors cursor-grab active:cursor-grabbing`}>
      <p className={`text-xs font-medium ${c.text} truncate`}>{visit.jobs?.title ?? '—'}</p>
      <p className={`text-xs ${c.sub}`}>
        {new Date(visit.scheduled_start).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true })}
      </p>
      {visit.profiles && <p className={`text-xs ${c.sub} truncate opacity-70`}>{visit.profiles.full_name}</p>}
    </div>
  )
}

function DraggableVisit({ visit, colorIdx }: { visit: Visit; colorIdx?: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: visit.id, data: { visit } })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <Link href={`/jobs/${visit.jobs?.id}`} onClick={e => { if (isDragging) e.preventDefault() }}>
        <VisitCard visit={visit} colorIdx={colorIdx} isDragging={isDragging} />
      </Link>
    </div>
  )
}

function DroppableDay({ day, children }: { day: Date; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: day.toISOString() })
  return (
    <div ref={setNodeRef} className={`min-h-[200px] rounded-lg transition-colors ${isOver ? 'bg-orange-50 ring-2 ring-orange-300' : ''}`}>
      {children}
    </div>
  )
}

export function ScheduleClient({ visits: initialVisits, team = [] }: { visits: Visit[]; team?: TeamMember[] }) {
  const [view, setView] = useState<'week' | 'list'>('week')
  const [visits, setVisits] = useState<Visit[]>(initialVisits)
  const [activeVisit, setActiveVisit] = useState<Visit | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]) // empty = all
  const supabase = createClient()

  // Build stable colour index map for each staff member
  const staffColorMap = Object.fromEntries(team.map((m, i) => [m.id, i]))

  function toggleStaff(id: string) {
    setSelectedStaff(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const filteredVisits = selectedStaff.length === 0
    ? visits
    : visits.filter(v => v.profiles && selectedStaff.includes(v.profiles.id))

  const today = new Date()
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(today)
    d.setDate(d.getDate() - d.getDay() + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function prevWeek() { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d) }
  function nextWeek() { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d) }
  function goToday() {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 1)
    d.setHours(0, 0, 0, 0)
    setWeekStart(d)
  }

  const days = getWeekDays(weekStart)
  const visitsForDay = (day: Date) => filteredVisits.filter(v => isSameDay(new Date(v.scheduled_start), day))

  function handleDragStart(event: DragStartEvent) {
    const visit = event.active.data.current?.visit as Visit
    setActiveVisit(visit ?? null)
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveVisit(null)
    const { active, over } = event
    if (!over) return

    const visit = active.data.current?.visit as Visit
    if (!visit) return

    const targetDay = new Date(over.id as string)
    const originalStart = new Date(visit.scheduled_start)
    const originalEnd = new Date(visit.scheduled_end)

    // Same day — no-op
    if (isSameDay(targetDay, originalStart)) return

    // Shift start/end to target day, preserving time-of-day and duration
    const duration = originalEnd.getTime() - originalStart.getTime()
    const newStart = new Date(targetDay)
    newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0)
    const newEnd = new Date(newStart.getTime() + duration)

    // Optimistic update
    setVisits(vs => vs.map(v => v.id === visit.id
      ? { ...v, scheduled_start: newStart.toISOString(), scheduled_end: newEnd.toISOString() }
      : v
    ))

    await supabase.from('job_visits').update({
      scheduled_start: newStart.toISOString(),
      scheduled_end: newEnd.toISOString(),
    }).eq('id', visit.id)
  }, [supabase])

  return (
    <div className="p-6">
      {/* Crew filter pills */}
      {team.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => setSelectedStaff([])}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedStaff.length === 0 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All staff
          </button>
          {team.map((m, i) => {
            const c = STAFF_COLORS[i % STAFF_COLORS.length]
            const active = selectedStaff.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggleStaff(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${active ? `${c.bg} ${c.border} ${c.text}` : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}
              >
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                {m.full_name}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium text-gray-700">
            {days[0].toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="p-2 rounded-lg hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={goToday} className="ml-2 text-xs text-orange-500 hover:text-[var(--accent,#f97316)] font-medium">Today</button>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['week', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === v ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
              {v === 'week' ? 'Week' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {view === 'week' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-7 gap-2">
            {days.map(day => {
              const dayVisits = visitsForDay(day)
              const isToday = isSameDay(day, today)
              return (
                <div key={day.toISOString()}>
                  <div className={`text-center mb-2 py-1 rounded-lg text-xs font-medium ${isToday ? 'bg-[var(--accent,#f97316)] text-white' : 'text-gray-500'}`}>
                    <p>{day.toLocaleDateString('en-NZ', { weekday: 'short' })}</p>
                    <p className="text-lg font-bold">{day.getDate()}</p>
                  </div>
                  <DroppableDay day={day}>
                    <div className="space-y-1.5">
                      {dayVisits.map(v => (
                        <DraggableVisit key={v.id} visit={v} colorIdx={v.profiles ? (staffColorMap[v.profiles.id] ?? 5) : 5} />
                      ))}
                    </div>
                  </DroppableDay>
                </div>
              )
            })}
          </div>

          <DragOverlay>
            {activeVisit && (
              <div className="w-32 rotate-2 shadow-lg">
                <VisitCard visit={activeVisit} colorIdx={activeVisit.profiles ? (staffColorMap[activeVisit.profiles.id] ?? 5) : 5} />
              </div>
            )}
          </DragOverlay>

          <p className="text-xs text-gray-400 text-center mt-4">Drag visits to reschedule</p>
        </DndContext>
      )}

      {view === 'list' && (
        <div className="space-y-2">
          {visits.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No upcoming visits</p>
            </div>
          ) : (
            visits.map(v => (
              <Link key={v.id} href={`/jobs/${v.jobs?.id}`} className="block bg-white border border-gray-200 rounded-xl px-5 py-3 hover:border-[var(--accent,#f97316)]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{v.jobs?.title ?? '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDateTime(v.scheduled_start)} · {v.jobs?.customers?.name} · {v.profiles?.full_name ?? 'Unassigned'}
                    </p>
                  </div>
                  <StatusBadge status={v.status} />
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
