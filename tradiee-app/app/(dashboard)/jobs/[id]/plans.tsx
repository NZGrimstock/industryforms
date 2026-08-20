'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Upload, Ruler, Square, Hash, Undo2, Trash2, RotateCcw, FileImage } from 'lucide-react'
import { polylineLength, polygonArea, calibrateScale, type Point } from '@/lib/takeoff'

type Mode = 'calibrate' | 'linear' | 'area' | 'count' | null
type Unit = 'm' | 'mm' | 'ft' | 'in'
type SavedMeasurement = { id: string; type: 'linear' | 'area' | 'count'; label: string; value: number; unit: string; points: Point[] }
export type PlanWithMeasurements = {
  id: string
  name: string
  image_url: string
  image_width: number
  image_height: number
  units_per_pixel: number | null
  calibration_unit: string | null
  job_plan_measurements: SavedMeasurement[]
}

const MAX_DISPLAY_WIDTH = 900

interface Props {
  jobId: string
  companyId: string
  profileId: string
  plans: PlanWithMeasurements[]
}

// Attaches the takeoff tool (originally a standalone /takeoff page, see
// lib/takeoff.ts for the geometry) to a job. A job can hold several plans
// (floor plan, site plan, ...); each plan can be reopened and added to.
// Mirrors the card pattern JobMaterials/JobVariations/site-diary already use
// on this page. Web only, matching the standalone tool's own scope — mobile
// takeoff is a real follow-up.
export function JobPlans({ jobId, companyId, profileId, plans: initialPlans }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [plans, setPlans] = useState(initialPlans)
  useEffect(() => { setPlans(initialPlans) }, [initialPlans])

  // null = list view. A non-null value is either an existing plan (real id)
  // being reopened, or a brand-new one (id: null) not yet saved.
  const [active, setActive] = useState<{ id: string | null; name: string } | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  const [mode, setMode] = useState<Mode>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [unitsPerPixel, setUnitsPerPixel] = useState<number | null>(null)
  const [calibrationUnit, setCalibrationUnit] = useState<Unit>('m')
  const [savedMeasurements, setSavedMeasurements] = useState<SavedMeasurement[]>([])
  const [pendingMeasurements, setPendingMeasurements] = useState<Omit<SavedMeasurement, 'id'>[]>([])

  const [calibrating, setCalibrating] = useState(false)
  const [calibrateInput, setCalibrateInput] = useState('1')
  const [finishing, setFinishing] = useState(false)
  const [labelInput, setLabelInput] = useState('')
  const [saving, setSaving] = useState(false)

  function startNewPlan() {
    setActive({ id: null, name: 'Plan' })
    setPendingFile(null)
    imgRef.current = null
    setCanvasSize(null)
    setNaturalSize(null)
    setUnitsPerPixel(null)
    setCalibrationUnit('m')
    setSavedMeasurements([])
    setPendingMeasurements([])
    cancelInProgress()
  }

  function openPlan(plan: PlanWithMeasurements) {
    setActive({ id: plan.id, name: plan.name })
    setPendingFile(null)
    setUnitsPerPixel(plan.units_per_pixel)
    setCalibrationUnit((plan.calibration_unit as Unit) ?? 'm')
    setSavedMeasurements(plan.job_plan_measurements)
    setPendingMeasurements([])
    cancelInProgress()

    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_DISPLAY_WIDTH / plan.image_width)
      imgRef.current = img
      setNaturalSize({ w: plan.image_width, h: plan.image_height })
      setCanvasSize({ w: Math.round(plan.image_width * scale), h: Math.round(plan.image_height * scale) })
    }
    img.onerror = () => toast('Could not load that plan image', 'error')
    img.src = plan.image_url
  }

  function loadFile(file: File) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_DISPLAY_WIDTH / img.naturalWidth)
      imgRef.current = img
      setPendingFile(file)
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
      setCanvasSize({ w: Math.round(img.naturalWidth * scale), h: Math.round(img.naturalHeight * scale) })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => toast('Could not load that image', 'error')
    img.src = url
  }

  // Redraw the image + saved measurement overlay + in-progress points.
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !canvasSize) return
    canvas.width = canvasSize.w
    canvas.height = canvasSize.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h)
    ctx.drawImage(img, 0, 0, canvasSize.w, canvasSize.h)

    function drawShape(pts: Point[], closed: boolean, color: string) {
      if (pts.length === 0) return
      ctx!.strokeStyle = color
      ctx!.fillStyle = color
      ctx!.lineWidth = 2
      ctx!.beginPath()
      pts.forEach((p, i) => (i === 0 ? ctx!.moveTo(p.x, p.y) : ctx!.lineTo(p.x, p.y)))
      if (closed) ctx!.closePath()
      ctx!.stroke()
      for (const p of pts) {
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, 3, 0, Math.PI * 2)
        ctx!.fill()
      }
    }
    for (const m of savedMeasurements) drawShape(m.points, m.type === 'area', '#3b82f6')
    for (const m of pendingMeasurements) drawShape(m.points, m.type === 'area', '#16a34a')
    drawShape(points, mode === 'area' && points.length > 2, mode === 'calibrate' ? '#dc2626' : '#f97316')
  }, [canvasSize, points, mode, savedMeasurements, pendingMeasurements])

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!mode || calibrating || finishing) return
    const rect = e.currentTarget.getBoundingClientRect()
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const next = [...points, point]
    setPoints(next)
    if (mode === 'calibrate' && next.length === 2) setCalibrating(true)
  }

  function undoPoint() { setPoints(prev => prev.slice(0, -1)) }

  function confirmCalibration() {
    const real = parseFloat(calibrateInput)
    if (!real || real <= 0 || points.length !== 2) return
    setUnitsPerPixel(calibrateScale(polylineLength(points), real))
    setCalibrating(false)
    setPoints([])
    setMode(null)
    toast('Scale set')
  }

  function startFinish() {
    if (mode === 'linear' && points.length < 2) return
    if (mode === 'area' && points.length < 3) return
    if (mode === 'count' && points.length < 1) return
    setLabelInput('')
    setFinishing(true)
  }

  function confirmFinish() {
    if (!mode || mode === 'calibrate') return
    let value: number
    let unit: string
    if (mode === 'linear') { value = polylineLength(points) * (unitsPerPixel ?? 0); unit = calibrationUnit }
    else if (mode === 'area') { value = polygonArea(points) * (unitsPerPixel ?? 0) ** 2; unit = `${calibrationUnit}²` }
    else { value = points.length; unit = 'count' }
    setPendingMeasurements(prev => [...prev, { type: mode, label: labelInput.trim() || `Measurement ${savedMeasurements.length + prev.length + 1}`, value, unit, points }])
    setPoints([])
    setFinishing(false)
    setMode(null)
  }

  function cancelInProgress() {
    setPoints([]); setCalibrating(false); setFinishing(false); setMode(null)
  }

  function removePending(index: number) {
    setPendingMeasurements(prev => prev.filter((_, i) => i !== index))
  }

  async function removeSaved(id: string) {
    setSavedMeasurements(prev => prev.filter(m => m.id !== id))
    await supabase.from('job_plan_measurements').delete().eq('id', id)
    router.refresh()
  }

  async function deletePlan(planId: string) {
    if (!confirm('Delete this plan and all its measurements?')) return
    setPlans(prev => prev.filter(p => p.id !== planId))
    await supabase.from('job_plans').delete().eq('id', planId)
    router.refresh()
  }

  async function savePlan() {
    if (!active) return
    if (!active.id && !pendingFile) return
    setSaving(true)
    try {
      let planId = active.id
      if (!planId) {
        // Brand new plan: upload the image first, then create the row.
        const ext = pendingFile!.name.split('.').pop() ?? 'png'
        const res = await fetch('/api/storage/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'job-plan', jobId, ext, contentType: pendingFile!.type }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Could not get an upload URL')
        const { url, publicUrl } = await res.json()
        const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': pendingFile!.type }, body: pendingFile })
        if (!put.ok) throw new Error('Upload to storage failed')

        const { data: planRow, error: planErr } = await supabase.from('job_plans').insert({
          job_id: jobId,
          company_id: companyId,
          name: active.name,
          image_url: publicUrl,
          image_width: naturalSize!.w,
          image_height: naturalSize!.h,
          units_per_pixel: unitsPerPixel,
          calibration_unit: unitsPerPixel ? calibrationUnit : null,
          created_by: profileId,
        }).select('id').single()
        if (planErr || !planRow) throw new Error(planErr?.message ?? 'Could not save the plan')
        planId = planRow.id
      } else if (unitsPerPixel !== plans.find(p => p.id === planId)?.units_per_pixel) {
        // Calibration was added/changed on an already-saved plan.
        await supabase.from('job_plans').update({ units_per_pixel: unitsPerPixel, calibration_unit: calibrationUnit }).eq('id', planId)
      }

      if (pendingMeasurements.length > 0) {
        const { error: mErr } = await supabase.from('job_plan_measurements').insert(
          pendingMeasurements.map((m, i) => ({
            plan_id: planId,
            type: m.type,
            label: m.label,
            value: m.value,
            unit: m.unit,
            points: m.points,
            sort_order: savedMeasurements.length + i,
          }))
        )
        if (mErr) throw new Error(mErr.message)
      }

      toast('Plan saved')
      setActive(null)
      router.refresh()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Could not save the plan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const liveLength = mode === 'linear' && unitsPerPixel ? polylineLength(points) * unitsPerPixel : null
  const liveArea = mode === 'area' && unitsPerPixel ? polygonArea(points) * unitsPerPixel ** 2 : null
  const dirty = !active?.id || pendingMeasurements.length > 0

  if (!active) {
    return (
      <div>
        {plans.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No plans yet. Upload one to measure lengths, areas or counts.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {plans.map(p => (
              <div key={p.id} className="px-6 py-3 flex items-center justify-between gap-3">
                <button onClick={() => openPlan(p)} className="flex items-center gap-2 text-left min-w-0 flex-1">
                  <FileImage className="h-4 w-4 text-gray-300 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-gray-800 truncate">{p.name}</span>
                    <span className="block text-xs text-gray-400">{p.job_plan_measurements.length} measurement{p.job_plan_measurements.length === 1 ? '' : 's'}{!p.units_per_pixel && ' · not calibrated'}</span>
                  </span>
                </button>
                <button onClick={() => deletePlan(p.id)} className="text-gray-300 hover:text-red-400 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="px-6 py-2">
          <button onClick={startNewPlan} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-[var(--accent,#f97316)] font-medium">
            <Upload className="h-3.5 w-3.5" /> New plan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 py-4">
      {!canvasSize ? (
        <div className="space-y-3">
          <Input value={active.name} onChange={e => setActive(a => a && ({ ...a, name: e.target.value }))} placeholder="Plan name (e.g. Floor plan)" className="max-w-xs" />
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
          <Card className="p-8 text-center border-dashed">
            <Upload className="h-6 w-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-3">Upload a plan image (PNG, JPG)</p>
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()}>Choose file</Button>
          </Card>
          <button onClick={() => setActive(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Button type="button" size="sm" variant={mode === 'calibrate' ? undefined : 'outline'} onClick={() => { cancelInProgress(); setMode('calibrate') }}>
              <Ruler className="h-3.5 w-3.5" /> Calibrate
            </Button>
            <Button type="button" size="sm" variant={mode === 'linear' ? undefined : 'outline'} disabled={!unitsPerPixel} onClick={() => { cancelInProgress(); setMode('linear') }}>
              <Ruler className="h-3.5 w-3.5" /> Length
            </Button>
            <Button type="button" size="sm" variant={mode === 'area' ? undefined : 'outline'} disabled={!unitsPerPixel} onClick={() => { cancelInProgress(); setMode('area') }}>
              <Square className="h-3.5 w-3.5" /> Area
            </Button>
            <Button type="button" size="sm" variant={mode === 'count' ? undefined : 'outline'} onClick={() => { cancelInProgress(); setMode('count') }}>
              <Hash className="h-3.5 w-3.5" /> Count
            </Button>
            <div className="flex-1" />
            {dirty && <Button type="button" size="sm" loading={saving} onClick={savePlan}>Save plan</Button>}
            <Button type="button" size="sm" variant="outline" onClick={() => setActive(null)}>
              <RotateCcw className="h-3.5 w-3.5" /> {active.id ? 'Close' : 'Discard'}
            </Button>
          </div>

          {!unitsPerPixel && mode !== 'calibrate' && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
              Calibrate the scale first — click &ldquo;Calibrate&rdquo;, then click two points a known distance apart.
            </p>
          )}

          <div className="overflow-auto border border-gray-100 rounded-lg">
            <canvas ref={canvasRef} onClick={handleCanvasClick} className={mode ? 'cursor-crosshair' : 'cursor-default'} />
          </div>

          {mode && points.length > 0 && !calibrating && !finishing && (
            <div className="flex items-center gap-2 mt-3">
              <Button type="button" size="sm" variant="outline" onClick={undoPoint}><Undo2 className="h-3.5 w-3.5" /> Undo point</Button>
              {mode !== 'calibrate' && <Button type="button" size="sm" onClick={startFinish}>Finish measurement</Button>}
              <Button type="button" size="sm" variant="outline" onClick={cancelInProgress}>Cancel</Button>
              {mode === 'linear' && liveLength != null && <span className="text-sm text-gray-500 ml-2">{liveLength.toFixed(2)} {calibrationUnit}</span>}
              {mode === 'area' && liveArea != null && <span className="text-sm text-gray-500 ml-2">{liveArea.toFixed(2)} {calibrationUnit}&sup2;</span>}
              {mode === 'count' && <span className="text-sm text-gray-500 ml-2">{points.length} counted</span>}
            </div>
          )}

          {calibrating && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-wrap items-end gap-3">
              <div>
                <Label>Real-world distance between those two points</Label>
                <Input type="number" step="0.01" value={calibrateInput} onChange={e => setCalibrateInput(e.target.value)} autoFocus className="w-32" />
              </div>
              <div>
                <Label>Unit</Label>
                <select value={calibrationUnit} onChange={e => setCalibrationUnit(e.target.value as Unit)} className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                  <option value="m">m</option><option value="mm">mm</option><option value="ft">ft</option><option value="in">in</option>
                </select>
              </div>
              <Button type="button" size="sm" onClick={confirmCalibration}>Set scale</Button>
              <Button type="button" size="sm" variant="outline" onClick={cancelInProgress}>Cancel</Button>
            </div>
          )}

          {finishing && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[10rem]">
                <Label>Label this measurement</Label>
                <Input value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="e.g. North wall, Bedroom 2 floor" autoFocus />
              </div>
              <Button type="button" size="sm" onClick={confirmFinish}>Add</Button>
              <Button type="button" size="sm" variant="outline" onClick={cancelInProgress}>Cancel</Button>
            </div>
          )}

          {(savedMeasurements.length > 0 || pendingMeasurements.length > 0) && (
            <div className="mt-3 space-y-1.5">
              {savedMeasurements.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  <span className="text-gray-700 truncate">{m.label} <span className="text-xs text-blue-500">saved</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-500">{m.unit === 'count' ? `${m.value} items` : `${m.value.toFixed(2)} ${m.unit}`}</span>
                    <button onClick={() => removeSaved(m.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
              ))}
              {pendingMeasurements.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm">
                  <span className="text-gray-700 truncate">{m.label} <span className="text-xs text-green-600">unsaved</span></span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-500">{m.unit === 'count' ? `${m.value} items` : `${m.value.toFixed(2)} ${m.unit}`}</span>
                    <button onClick={() => removePending(i)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
