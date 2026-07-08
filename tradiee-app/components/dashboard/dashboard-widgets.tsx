'use client'

import { ReactNode, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export type DashboardWidgetId = 'stats' | 'todos' | 'recent_jobs' | 'overdue_invoices' | 'profitability'

export type DashboardWidgetConfig = {
  order?: string[]
  hidden?: string[]
  audit?: {
    built_by: 'Codex'
    built_at: string
    feature: 'configurable_dashboard_widgets'
  }
}

export type DashboardWidget = {
  id: DashboardWidgetId
  label: string
  node: ReactNode
}

const DEFAULT_ORDER: DashboardWidgetId[] = ['stats', 'todos', 'recent_jobs', 'overdue_invoices', 'profitability']
const CODEX_AUDIT = {
  built_by: 'Codex',
  built_at: '2026-07-07',
  feature: 'configurable_dashboard_widgets',
} as const

function normaliseConfig(config: DashboardWidgetConfig | null | undefined, available: DashboardWidgetId[]) {
  const availableSet = new Set(available)
  const savedOrder = config?.order ?? []
  const order = [
    ...(savedOrder.filter((id): id is DashboardWidgetId => availableSet.has(id as DashboardWidgetId))),
    ...DEFAULT_ORDER.filter(id => availableSet.has(id) && !savedOrder.includes(id)),
  ]
  // Only place todos at slot #2 when the user has no existing preference for it
  // (first signup/login, or a legacy config saved before the widget existed).
  // Once it's present in a saved order, leave it wherever the user put it.
  if (availableSet.has('todos') && !savedOrder.includes('todos')) {
    const withoutTodos: DashboardWidgetId[] = order.filter(id => id !== 'todos')
    const target = withoutTodos[0] === 'stats' ? 1 : Math.min(1, withoutTodos.length)
    withoutTodos.splice(target, 0, 'todos')
    order.splice(0, order.length, ...withoutTodos)
  }
  const hidden = (config?.hidden ?? []).filter((id): id is DashboardWidgetId => availableSet.has(id as DashboardWidgetId))
  return { order, hidden }
}

export function DashboardWidgets({
  profileId,
  widgets,
  initialConfig,
}: {
  profileId: string
  widgets: DashboardWidget[]
  initialConfig?: DashboardWidgetConfig | null
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const availableIds = useMemo(() => widgets.map(w => w.id), [widgets])
  const initial = useMemo(() => normaliseConfig(initialConfig, availableIds), [initialConfig, availableIds])
  const [order, setOrder] = useState<DashboardWidgetId[]>(initial.order)
  const [hidden, setHidden] = useState<DashboardWidgetId[]>(initial.hidden)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const widgetById = useMemo(() => new Map(widgets.map(w => [w.id, w])), [widgets])

  function persist(nextOrder: DashboardWidgetId[], nextHidden: DashboardWidgetId[]) {
    setSaving(true)
    setSaveError('')
    void (async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ dashboard_widgets: { order: nextOrder, hidden: nextHidden, audit: CODEX_AUDIT } })
          .eq('id', profileId)
        if (error) setSaveError(error.message)
      } finally {
        setSaving(false)
      }
    })()
  }

  function move(id: DashboardWidgetId, direction: -1 | 1) {
    const index = order.indexOf(id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
    persist(next, hidden)
  }

  function toggle(id: DashboardWidgetId) {
    const nextHidden = hidden.includes(id) ? hidden.filter(item => item !== id) : [...hidden, id]
    setHidden(nextHidden)
    persist(order, nextHidden)
  }

  const visibleWidgets = order.map(id => widgetById.get(id)).filter((w): w is DashboardWidget => !!w && !hidden.includes(w.id))

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(value => !value)}
            title="Customise dashboard"
            aria-label="Customise dashboard"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <SlidersHorizontal className="h-4 w-4" />}
            Widgets
          </Button>
          {open && (
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-sm font-semibold text-gray-900">Widgets</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title="Close"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {order.map((id, index) => {
                  const widget = widgetById.get(id)
                  if (!widget) return null
                  const isHidden = hidden.includes(id)
                  return (
                    <div key={id} className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggle(id)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                        title={isHidden ? 'Show widget' : 'Hide widget'}
                        aria-label={isHidden ? 'Show widget' : 'Hide widget'}
                      >
                        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <span className={`min-w-0 flex-1 truncate text-sm ${isHidden ? 'text-gray-400' : 'text-gray-800'}`}>
                        {widget.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => move(id, -1)}
                        disabled={index === 0}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30"
                        title="Move up"
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(id, 1)}
                        disabled={index === order.length - 1}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30"
                        title="Move down"
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
              {saveError && (
                <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
                  Could not save widget preferences: {saveError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {visibleWidgets.length > 0 ? (
        visibleWidgets.map(widget => <div key={widget.id}>{widget.node}</div>)
      ) : (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white px-6 py-8 text-center text-sm text-gray-400">
          No widgets selected
        </div>
      )}
    </div>
  )
}
