'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'

interface Props { companyId: string }

export function NewFormButton({ companyId }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function create() {
    if (!name.trim()) return
    setLoading(true)
    const { data, error } = await supabase.from('form_templates').insert({
      company_id: companyId,
      name: name.trim(),
      description: description.trim() || null,
      fields: [],
    }).select('id').single()
    setLoading(false)
    if (error) { alert(error.message); return }
    if (data) router.push(`/forms/${data.id}`)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--accent,#f97316)] text-white text-sm font-medium rounded-xl hover:bg-[var(--accent-hover,#ea580c)] transition-colors">
        <Plus className="h-4 w-4" /> New form
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">New form template</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Template name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Electrical Safety Certificate"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this form used for?"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-orange-400 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={create}
            disabled={!name.trim() || loading}
            className="flex-1 px-4 py-2.5 bg-[var(--accent,#f97316)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Creating...' : 'Create & build'}
          </button>
        </div>
      </div>
    </div>
  )
}
