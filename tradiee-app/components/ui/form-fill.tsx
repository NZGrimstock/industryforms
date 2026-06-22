'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, ChevronDown, X, CheckCircle, Printer } from 'lucide-react'
import type { FormField } from '@/app/(dashboard)/forms/[id]/builder'

interface Template { id: string; name: string; fields: FormField[] }
interface Submission { id: string; template_name: string; submitted_at: string | null; answers: Record<string, unknown> }

interface Props {
  jobId: string
  companyId: string
  profileId: string
  templates: Template[]
  existingSubmissions: Submission[]
}

export function FormFill({ jobId, companyId, profileId, templates, existingSubmissions }: Props) {
  const [view, setView] = useState<'list' | 'pick' | 'fill'>('list')
  const [selected, setSelected] = useState<Template | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [submissions, setSubmissions] = useState<Submission[]>(existingSubmissions)
  const supabase = createClient()
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({})

  function startFill(template: Template) {
    setSelected(template)
    setAnswers({})
    setView('fill')
  }

  function setAnswer(fieldId: string, value: unknown) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }))
  }

  async function submit() {
    if (!selected) return
    setSaving(true)

    // Capture signature canvases as data URLs
    const finalAnswers = { ...answers }
    for (const field of selected.fields) {
      if (field.type === 'signature') {
        const canvas = canvasRefs.current[field.id]
        if (canvas) finalAnswers[field.id] = canvas.toDataURL()
      }
    }

    const { data } = await supabase.from('form_submissions').insert({
      job_id: jobId,
      company_id: companyId,
      template_id: selected.id,
      template_name: selected.name,
      answers: finalAnswers,
      submitted_by: profileId,
      submitted_at: new Date().toISOString(),
    }).select('id, template_name, submitted_at, answers').single()

    setSaving(false)
    if (data) {
      setSubmissions(prev => [...prev, data as Submission])
      setView('list')
    }
  }

  if (view === 'pick') {
    return (
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-gray-700">Select a form template</p>
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-1.5">
          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => startFill(t)}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-orange-50 border border-transparent hover:border-orange-200 transition-colors"
            >
              <FileText className="h-4 w-4 text-orange-400 shrink-0" />
              <span className="text-sm text-gray-700">{t.name}</span>
              <span className="text-xs text-gray-400 ml-auto">{t.fields.length} fields</span>
            </button>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-gray-400 py-2 text-center">No form templates yet — create one under Forms</p>
          )}
        </div>
      </div>
    )
  }

  if (view === 'fill' && selected) {
    return (
      <div className="px-4 py-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{selected.name}</h3>
          <button onClick={() => setView('list')} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 mb-6">
          {selected.fields.map(field => (
            <div key={field.id}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
              </label>
              <FieldInput
                field={field}
                value={answers[field.id]}
                onChange={v => setAnswer(field.id, v)}
                canvasRef={(el: HTMLCanvasElement | null) => { canvasRefs.current[field.id] = el }}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={() => setView('list')} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent,#f97316)] text-white text-sm font-medium rounded-lg hover:bg-[var(--accent-hover,#ea580c)] disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            {saving ? 'Submitting...' : 'Submit form'}
          </button>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="px-4 py-3 border-t border-gray-100">
      {submissions.length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {submissions.map(s => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="text-gray-700">{s.template_name}</span>
                {s.submitted_at && <span className="text-xs text-gray-400">{new Date(s.submitted_at).toLocaleDateString('en-NZ')}</span>}
              </div>
              <button
                onClick={() => printSubmission(s)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
              >
                <Printer className="h-3 w-3" /> Print
              </button>
            </li>
          ))}
        </ul>
      )}
      {templates.length > 0 && (
        <button
          onClick={() => setView('pick')}
          className="flex items-center gap-2 text-sm text-orange-500 hover:text-[var(--accent,#f97316)] font-medium"
        >
          <FileText className="h-4 w-4" />
          Fill a site form
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function FieldInput({ field, value, onChange, canvasRef }: {
  field: FormField
  value: unknown
  onChange: (v: unknown) => void
  canvasRef: (el: HTMLCanvasElement | null) => void
}) {
  const baseClass = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-400'

  switch (field.type) {
    case 'text':
      return <input type="text" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} placeholder={field.placeholder} className={baseClass} />
    case 'textarea':
      return <textarea value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} rows={3} className={`${baseClass} resize-none`} />
    case 'number':
      return <input type="number" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={baseClass} />
    case 'date':
      return <input type="date" value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={baseClass} />
    case 'checkbox':
      return (
        <div className="flex gap-4">
          {['Yes', 'No', 'N/A'].map(opt => (
            <label key={opt} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input type="radio" name={field.id} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
              {opt}
            </label>
          ))}
        </div>
      )
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={e => onChange(e.target.value)} className={baseClass}>
          <option value="">Select...</option>
          {(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case 'signature':
      return <SignaturePad fieldId={field.id} canvasRef={canvasRef} />
    case 'photo':
      return (
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={e => {
            const f = e.target.files?.[0]
            if (!f) return
            const reader = new FileReader()
            reader.onload = ev => onChange(ev.target?.result)
            reader.readAsDataURL(f)
          }}
          className="text-sm text-gray-600"
        />
      )
    default:
      return null
  }
}

function SignaturePad({ fieldId, canvasRef }: { fieldId: string; canvasRef: (el: HTMLCanvasElement | null) => void }) {
  const [drawing, setDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const ref = useRef<HTMLCanvasElement | null>(null)

  function setRefs(el: HTMLCanvasElement | null) {
    ref.current = el
    canvasRef(el)
  }

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const src = 'touches' in e ? e.touches[0] : e
    return { x: src.clientX - rect.left, y: src.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setDrawing(true)
    setHasSig(true)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!drawing) return
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  function end() { setDrawing(false) }

  function clear() {
    const canvas = ref.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
  }

  return (
    <div>
      <canvas
        ref={setRefs}
        width={400}
        height={120}
        className="border border-gray-200 rounded-lg touch-none cursor-crosshair bg-white w-full"
        style={{ maxHeight: 120 }}
        onMouseDown={start}
        onMouseMove={draw}
        onMouseUp={end}
        onTouchStart={start}
        onTouchMove={draw}
        onTouchEnd={end}
      />
      <button onClick={clear} className="text-xs text-gray-400 hover:text-gray-600 mt-1">Clear</button>
    </div>
  )
}

function printSubmission(submission: Submission) {
  const answers = submission.answers as Record<string, unknown>
  const rows = Object.entries(answers).map(([k, v]) => {
    if (typeof v === 'string' && v.startsWith('data:image')) {
      return `<tr><td style="padding:8px;font-size:12px;color:#666">${k}</td><td style="padding:8px"><img src="${v}" style="max-width:200px;max-height:150px"></td></tr>`
    }
    return `<tr><td style="padding:8px;font-size:12px;color:#666">${k}</td><td style="padding:8px;font-size:13px">${String(v ?? '—')}</td></tr>`
  }).join('')

  const html = `
    <html><head><style>body{font-family:sans-serif;padding:24px}h1{font-size:18px;margin-bottom:4px}p{color:#666;font-size:13px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td{border-bottom:1px solid #eee;vertical-align:top}@media print{button{display:none}}</style></head>
    <body>
      <h1>${submission.template_name}</h1>
      <p>Submitted ${submission.submitted_at ? new Date(submission.submitted_at).toLocaleString('en-NZ') : ''}</p>
      <table>${rows}</table>
      <script>window.onload=()=>window.print()</script>
    </body></html>
  `
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}
