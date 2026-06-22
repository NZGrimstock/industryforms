'use client'
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, GripVertical, Save, CheckCircle } from 'lucide-react'

export type FieldType = 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'date' | 'signature' | 'photo'

export interface FormField {
  id: string
  type: FieldType
  label: string
  required: boolean
  options?: string[]  // for select type
  placeholder?: string
}

const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text', label: 'Short text', icon: '𝙏' },
  { type: 'textarea', label: 'Long text', icon: '¶' },
  { type: 'number', label: 'Number', icon: '#' },
  { type: 'checkbox', label: 'Yes / No', icon: '☑' },
  { type: 'select', label: 'Dropdown', icon: '▾' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'signature', label: 'Signature', icon: '✍' },
  { type: 'photo', label: 'Photo', icon: '📷' },
]

interface Props {
  template: { id: string; name: string; description: string | null; fields: unknown; is_active: boolean }
  companyId: string
}

export function FormBuilder({ template, companyId }: Props) {
  const [fields, setFields] = useState<FormField[]>((template.fields as FormField[]) ?? [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const supabase = createClient()

  function addField(type: FieldType) {
    const newField: FormField = {
      id: crypto.randomUUID(),
      type,
      label: FIELD_TYPES.find(f => f.type === type)?.label ?? type,
      required: false,
      ...(type === 'select' ? { options: ['Option 1', 'Option 2'] } : {}),
    }
    setFields(prev => [...prev, newField])
  }

  function updateField(id: string, updates: Partial<FormField>) {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }

  function removeField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id))
  }

  function moveField(id: string, direction: 'up' | 'down') {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === id)
      if (idx === -1) return prev
      const next = direction === 'up' ? idx - 1 : idx + 1
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  const save = useCallback(async () => {
    setSaving(true)
    await supabase.from('form_templates').update({
      name,
      description: description || null,
      fields,
      updated_at: new Date().toISOString(),
    }).eq('id', template.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [supabase, template.id, name, description, fields])

  return (
    <div className="p-6 max-w-3xl">
      {/* Template header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Form name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full text-lg font-semibold text-gray-900 border-b border-gray-200 focus:border-orange-400 outline-none pb-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full text-sm text-gray-600 border-b border-gray-200 focus:border-orange-400 outline-none pb-1"
          />
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-2 mb-6">
        {fields.length === 0 && (
          <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-sm">No fields yet — add some below</p>
          </div>
        )}
        {fields.map((field, idx) => (
          <FieldEditor
            key={field.id}
            field={field}
            isFirst={idx === 0}
            isLast={idx === fields.length - 1}
            onChange={updates => updateField(field.id, updates)}
            onRemove={() => removeField(field.id)}
            onMove={dir => moveField(field.id, dir)}
          />
        ))}
      </div>

      {/* Add field */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <p className="text-xs font-medium text-gray-500 mb-3">Add field</p>
        <div className="flex flex-wrap gap-2">
          {FIELD_TYPES.map(ft => (
            <button
              key={ft.type}
              onClick={() => addField(ft.type)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-[var(--accent,#f97316)]/40 hover:text-[var(--accent,#f97316)] transition-colors"
            >
              <span>{ft.icon}</span> {ft.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-3 bg-[var(--accent,#f97316)] text-white text-sm font-medium rounded-xl hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-50 transition-colors"
      >
        {saved ? <CheckCircle className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save form'}
      </button>
    </div>
  )
}

function FieldEditor({
  field, isFirst, isLast, onChange, onRemove, onMove,
}: {
  field: FormField
  isFirst: boolean
  isLast: boolean
  onChange: (u: Partial<FormField>) => void
  onRemove: () => void
  onMove: (dir: 'up' | 'down') => void
}) {
  const typeInfo = FIELD_TYPES.find(f => f.type === field.type)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-0.5 pt-1">
          <button onClick={() => onMove('up')} disabled={isFirst} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▲</button>
          <GripVertical className="h-4 w-4 text-gray-300" />
          <button onClick={() => onMove('down')} disabled={isLast} className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs leading-none">▼</button>
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
              {typeInfo?.icon} {typeInfo?.label}
            </span>
            <input
              value={field.label}
              onChange={e => onChange({ label: e.target.value })}
              placeholder="Field label"
              className="flex-1 text-sm font-medium text-gray-900 border-b border-gray-200 focus:border-orange-400 outline-none pb-0.5"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={field.required}
                onChange={e => onChange({ required: e.target.checked })}
                className="rounded"
              />
              Required
            </label>
          </div>

          {field.type === 'text' && (
            <input
              value={field.placeholder ?? ''}
              onChange={e => onChange({ placeholder: e.target.value })}
              placeholder="Placeholder text (optional)"
              className="w-full text-xs text-gray-500 border border-dashed border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-300"
            />
          )}

          {field.type === 'select' && (
            <div className="space-y-1">
              <p className="text-xs text-gray-400">Options (one per line)</p>
              <textarea
                value={(field.options ?? []).join('\n')}
                onChange={e => onChange({ options: e.target.value.split('\n').filter(Boolean) })}
                rows={3}
                className="w-full text-xs border border-dashed border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-gray-300 resize-none"
              />
            </div>
          )}

          {field.type === 'signature' && (
            <p className="text-xs text-gray-400 italic">Customer/technician signature will be captured on the device</p>
          )}
          {field.type === 'photo' && (
            <p className="text-xs text-gray-400 italic">Photo capture from device camera or file upload</p>
          )}
        </div>

        <button onClick={onRemove} className="text-gray-300 hover:text-red-400 transition-colors mt-1">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
