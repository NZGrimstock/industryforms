'use client'
import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import PROGRAMS, { TARGET_FIELDS, type DataType, type ProgramConfig } from '@/lib/import/programs'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Upload, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Step = 'program' | 'type' | 'instructions' | 'upload' | 'mapping' | 'preview' | 'done'

const DATA_TYPES: { id: DataType; label: string; desc: string }[] = [
  { id: 'customers', label: 'Customers', desc: 'Names, contacts, addresses' },
  { id: 'jobs',      label: 'Jobs',      desc: 'Job history and status' },
  { id: 'invoices',  label: 'Invoices',  desc: 'Invoice history' },
  { id: 'price_list',label: 'Price list',desc: 'Products, materials, labour rates' },
]

interface ParsedData {
  headers: string[]
  rows: Record<string, string>[]
}

export function ImportWizard() {
  const [step, setStep]         = useState<Step>('program')
  const [program, setProgram]   = useState<ProgramConfig | null>(null)
  const [dataType, setDataType] = useState<DataType | null>(null)
  const [parsed, setParsed]     = useState<ParsedData | null>(null)
  const [mapping, setMapping]   = useState<Record<string, string>>({})  // targetField → sourceHeader
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<{ inserted: number; skipped: number } | null>(null)
  const [fileName, setFileName] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Auto-map columns based on program's known mappings
  function autoMap(headers: string[], prog: ProgramConfig, dt: DataType) {
    const colMap = prog.columnMaps[dt]
    const m: Record<string, string> = {}
    for (const [targetField, candidates] of Object.entries(colMap)) {
      for (const candidate of candidates) {
        const found = headers.find(h => h.toLowerCase().trim() === candidate.toLowerCase().trim())
        if (found) { m[targetField] = found; break }
      }
    }
    return m
  }

  async function handleFile(file: File) {
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()
    try {
      if (ext === 'csv' || ext === 'txt') {
        const text = await file.text()
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (res) => {
            const headers = res.meta.fields ?? []
            const rows = (res.data as Record<string, string>[]).slice(0, 500) // cap at 500 rows
            setParsed({ headers, rows })
            if (program && dataType) {
              setMapping(autoMap(headers, program, dataType))
            }
            setStep('mapping')
          },
          error: () => toast('Could not parse CSV', 'error'),
        })
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
        const headers = data.length > 0 ? Object.keys(data[0]) : []
        const rows = data.slice(0, 500)
        setParsed({ headers, rows })
        if (program && dataType) {
          setMapping(autoMap(headers, program, dataType))
        }
        setStep('mapping')
      } else {
        toast('Please upload a CSV or Excel (.xlsx) file', 'error')
      }
    } catch {
      toast('Failed to read file', 'error')
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [program, dataType]) // eslint-disable-line

  async function runImport() {
    if (!parsed || !dataType) return
    setLoading(true)
    // Build rows using the mapping
    const mapped = parsed.rows.map(row => {
      const out: Record<string, string> = {}
      for (const [targetField, sourceHeader] of Object.entries(mapping)) {
        out[targetField] = row[sourceHeader] ?? ''
      }
      return out
    })
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataType, rows: mapped }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setStep('done')
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error')
    }
    setLoading(false)
  }

  function reset() {
    setStep('program'); setProgram(null); setDataType(null)
    setParsed(null); setMapping({}); setResult(null); setFileName('')
  }

  const targets = dataType ? TARGET_FIELDS[dataType] : []
  const unmappedRequired = targets.filter(t => t.required && !mapping[t.key])
  const previewRows = parsed?.rows.slice(0, 5) ?? []

  return (
    <div className="max-w-2xl">
      {/* Progress bar */}
      {step !== 'done' && (
        <div className="flex items-center gap-2 mb-8">
          {(['program', 'type', 'instructions', 'upload', 'mapping', 'preview'] as const).map((s, i) => {
            const steps = ['program', 'type', 'instructions', 'upload', 'mapping', 'preview']
            const current = steps.indexOf(step)
            const done = steps.indexOf(s) < current
            const active = s === step
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                  active ? 'bg-[var(--accent,#f97316)] text-white' : done ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
                )}>
                  {done ? '✓' : i + 1}
                </div>
                {i < 5 && <div className={cn('h-0.5 w-6', done ? 'bg-green-500' : 'bg-gray-200')} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Step 1: Choose program */}
      {step === 'program' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Which program are you switching from?</h2>
          <p className="text-sm text-gray-500 mb-6">We&apos;ll pre-fill the column mapping for your export format.</p>
          <div className="grid grid-cols-2 gap-3">
            {PROGRAMS.map(p => (
              <button
                key={p.id}
                onClick={() => { setProgram(p); setStep('type') }}
                className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-[var(--accent,#f97316)]/40 hover:shadow-sm transition-all text-left"
              >
                <span className="text-2xl">{p.logo}</span>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Choose data type */}
      {step === 'type' && program && (
        <div>
          <button onClick={() => setStep('program')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">What do you want to import from {program.name}?</h2>
          <p className="text-sm text-gray-500 mb-6">Import one type at a time. Start with Customers, then Jobs.</p>
          <div className="space-y-2">
            {DATA_TYPES.map(dt => (
              <button
                key={dt.id}
                onClick={() => { setDataType(dt.id); setStep('instructions') }}
                className="w-full flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-[var(--accent,#f97316)]/40 hover:shadow-sm transition-all text-left"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">{dt.label}</p>
                  <p className="text-xs text-gray-400">{dt.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Export instructions */}
      {step === 'instructions' && program && dataType && (
        <div>
          <button onClick={() => setStep('type')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Export from {program.name}</h2>
          <p className="text-sm text-gray-500 mb-4">Follow these steps to get your data ready:</p>
          <div className="space-y-3 mb-6">
            {program.exportInstructions[dataType].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-[var(--accent,#f97316)]">{i + 1}</span>
                </div>
                <p className="text-sm text-gray-700">{step}</p>
              </div>
            ))}
          </div>
          <Button onClick={() => setStep('upload')}>
            I have the file, continue <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 4: Upload */}
      {step === 'upload' && (
        <div>
          <button onClick={() => setStep('instructions')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload your export file</h2>
          <p className="text-sm text-gray-500 mb-6">CSV or Excel (.xlsx) files accepted. Max 500 rows per import.</p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
              dragOver ? 'border-orange-400 bg-orange-50' : 'border-gray-300 hover:border-[var(--accent,#f97316)]/40 hover:bg-orange-50/40'
            )}
          >
            <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">Drop file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">CSV, XLS, XLSX</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
        </div>
      )}

      {/* Step 5: Column mapping */}
      {step === 'mapping' && parsed && dataType && (
        <div>
          <button onClick={() => setStep('upload')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900">Map columns</h2>
          </div>
          <p className="text-sm text-gray-500 mb-1">
            <span className="font-medium">{fileName}</span> — {parsed.rows.length} rows, {parsed.headers.length} columns
          </p>
          <p className="text-xs text-gray-400 mb-5">We&apos;ve auto-mapped where possible. Adjust any that look wrong.</p>

          <div className="space-y-3 mb-6">
            {targets.map(({ key, label, required }) => (
              <div key={key} className="flex items-center gap-3">
                <div className="w-36 shrink-0">
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                  {required && <span className="text-xs text-red-400">Required</span>}
                </div>
                <select
                  value={mapping[key] ?? ''}
                  onChange={e => setMapping(m => ({ ...m, [key]: e.target.value }))}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  <option value="">— skip this field —</option>
                  {parsed.headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                {mapping[key] ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : required ? (
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                ) : (
                  <div className="h-4 w-4 shrink-0" />
                )}
              </div>
            ))}
          </div>

          {unmappedRequired.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Map required field{unmappedRequired.length > 1 ? 's' : ''}: {unmappedRequired.map(f => f.label).join(', ')}
            </div>
          )}

          <Button
            onClick={() => setStep('preview')}
            disabled={unmappedRequired.length > 0}
          >
            Preview import <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Step 6: Preview */}
      {step === 'preview' && parsed && dataType && (
        <div>
          <button onClick={() => setStep('mapping')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-4">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Preview first 5 rows</h2>
          <p className="text-sm text-gray-500 mb-4">
            {parsed.rows.length} row{parsed.rows.length !== 1 ? 's' : ''} will be imported.
          </p>
          <div className="overflow-x-auto mb-6 rounded-xl border border-gray-200">
            <table className="text-xs w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {targets.filter(t => mapping[t.key]).map(t => (
                    <th key={t.key} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    {targets.filter(t => mapping[t.key]).map(t => (
                      <td key={t.key} className="px-3 py-2 text-gray-700 max-w-[150px] truncate">{row[mapping[t.key]] ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button loading={loading} onClick={runImport}>
              Import {parsed.rows.length} records
            </Button>
            <Button variant="outline" onClick={reset}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Step 7: Done */}
      {step === 'done' && result && dataType && (
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Import complete</h2>
          <p className="text-gray-500 text-sm mb-6">
            <span className="font-semibold text-green-600">{result.inserted}</span> records imported
            {result.skipped > 0 && <span className="text-gray-400">, {result.skipped} skipped (missing required fields)</span>}
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => {
              reset()
              setProgram(program) // keep program selection
              setStep('type')
            }}>
              Import another type
            </Button>
            <Button variant="outline" onClick={reset}>Start over</Button>
          </div>
        </div>
      )}
    </div>
  )
}
