'use client'
import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Upload, Ruler, Square, Hash, Undo2, Copy, Trash2, RotateCcw } from 'lucide-react'
import { polylineLength, polygonArea, calibrateScale, type Point } from '@/lib/takeoff'

type Mode = 'calibrate' | 'linear' | 'area' | 'count' | null
type Unit = 'm' | 'mm' | 'ft' | 'in'
type Measurement = { id: string; type: 'linear' | 'area' | 'count'; label: string; value: number; unit: string }

const MAX_DISPLAY_WIDTH = 900

// Everything here is client-only and in-memory: the plan image never leaves
// the browser, nothing is persisted. Deliberately scoped down from a full
// takeoff tool (no saved plans, no binding a measurement to a quote line) —
// see PROJECT_STATE.md for the reasoning. Point coordinates are stored in
// the canvas's own fixed display-pixel space; there's no pan/zoom/resize in
// this version, so that space never changes between calibrating and
// measuring, and no natural-resolution conversion is needed.
export function TakeoffTool() {
  const { toast } = useToast()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null)
  const [mode, setMode] = useState<Mode>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [unitsPerPixel, setUnitsPerPixel] = useState<number | null>(null)
  const [calibrationUnit, setCalibrationUnit] = useState<Unit>('m')
  const [measurements, setMeasurements] = useState<Measurement[]>([])

  // Calibration confirm step: two points are clicked, then this form asks
  // for the real-world distance between them before unitsPerPixel is set.
  const [calibrating, setCalibrating] = useState(false)
  const [calibrateInput, setCalibrateInput] = useState('1')

  // Finish-measurement step: asks for a label before the in-progress points
  // become a saved row.
  const [finishing, setFinishing] = useState(false)
  const [labelInput, setLabelInput] = useState('')

  function loadFile(file: File) {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_DISPLAY_WIDTH / img.naturalWidth)
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      imgRef.current = img
      setCanvasSize({ w, h })
      setPoints([])
      setUnitsPerPixel(null)
      setMeasurements([])
      setMode(null)
      URL.revokeObjectURL(url)
    }
    img.onerror = () => toast('Could not load that image', 'error')
    img.src = url
  }

  // Redraw the image + in-progress points + a light overlay of finished
  // measurements' shapes whenever anything relevant changes.
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

    if (points.length > 0) {
      ctx.strokeStyle = mode === 'calibrate' ? '#dc2626' : '#f97316'
      ctx.fillStyle = ctx.strokeStyle
      ctx.lineWidth = 2
      ctx.beginPath()
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      if (mode === 'area' && points.length > 2) ctx.closePath()
      ctx.stroke()
      for (const p of points) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [canvasSize, points, mode])

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!mode || calibrating || finishing) return
    const rect = e.currentTarget.getBoundingClientRect()
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const next = [...points, point]
    setPoints(next)
    if (mode === 'calibrate' && next.length === 2) setCalibrating(true)
  }

  function undoPoint() {
    setPoints(prev => prev.slice(0, -1))
  }

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
    if (mode === 'linear') {
      value = polylineLength(points) * (unitsPerPixel ?? 0)
      unit = calibrationUnit
    } else if (mode === 'area') {
      value = polygonArea(points) * (unitsPerPixel ?? 0) ** 2
      unit = `${calibrationUnit}²`
    } else {
      value = points.length
      unit = 'count'
    }
    setMeasurements(prev => [...prev, { id: crypto.randomUUID(), type: mode, label: labelInput.trim() || `Measurement ${prev.length + 1}`, value, unit }])
    setPoints([])
    setFinishing(false)
    setMode(null)
  }

  function cancelInProgress() {
    setPoints([])
    setCalibrating(false)
    setFinishing(false)
    setMode(null)
  }

  function removeMeasurement(id: string) {
    setMeasurements(prev => prev.filter(m => m.id !== id))
  }

  async function copyMeasurement(m: Measurement) {
    try {
      await navigator.clipboard.writeText(m.unit === 'count' ? String(m.value) : m.value.toFixed(2))
      toast('Copied')
    } catch {
      toast(`Value: ${m.value.toFixed(2)}`, 'error')
    }
  }

  const liveLength = mode === 'linear' && unitsPerPixel ? polylineLength(points) * unitsPerPixel : null
  const liveArea = mode === 'area' && unitsPerPixel ? polygonArea(points) * unitsPerPixel ** 2 : null

  return (
    <div className="p-6 max-w-5xl">
      <p className="text-sm text-gray-500 mb-4 max-w-2xl">
        Upload a photo or screenshot of a plan, calibrate it against one known measurement, then click points to measure
        lengths, areas or count items. Nothing here is saved — read off a number and enter it on your quote or job.
      </p>

      {!canvasSize ? (
        <Card className="p-10 text-center border-dashed">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
          <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-3">Upload a plan image (PNG, JPG)</p>
          <Button type="button" onClick={() => fileRef.current?.click()}>Choose file</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4">
          <Card className="p-3">
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
              <Button type="button" size="sm" variant="outline" onClick={() => { imgRef.current = null; setCanvasSize(null); cancelInProgress(); setUnitsPerPixel(null); setMeasurements([]) }}>
                <RotateCcw className="h-3.5 w-3.5" /> New plan
              </Button>
            </div>

            {!unitsPerPixel && mode !== 'calibrate' && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
                Calibrate the scale first — click &ldquo;Calibrate&rdquo;, then click two points a known distance apart (e.g. the ends of a wall on a dimension line).
              </p>
            )}

            <div className="overflow-auto border border-gray-100 rounded-lg">
              <canvas ref={canvasRef} onClick={handleCanvasClick} className={mode ? 'cursor-crosshair' : 'cursor-default'} />
            </div>

            {mode && points.length > 0 && !calibrating && !finishing && (
              <div className="flex items-center gap-2 mt-3">
                <Button type="button" size="sm" variant="outline" onClick={undoPoint}><Undo2 className="h-3.5 w-3.5" /> Undo point</Button>
                {mode !== 'calibrate' && (
                  <Button type="button" size="sm" onClick={startFinish}>Finish measurement</Button>
                )}
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
                    <option value="m">m</option>
                    <option value="mm">mm</option>
                    <option value="ft">ft</option>
                    <option value="in">in</option>
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
                <Button type="button" size="sm" onClick={confirmFinish}>Save</Button>
                <Button type="button" size="sm" variant="outline" onClick={cancelInProgress}>Cancel</Button>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Scale</h3>
            <p className="text-sm text-gray-500 mb-4">{unitsPerPixel ? 'Calibrated' : 'Not calibrated yet'}</p>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Measurements</h3>
            {measurements.length === 0 ? (
              <p className="text-sm text-gray-400">None yet</p>
            ) : (
              <div className="space-y-2">
                {measurements.map(m => (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{m.label}</p>
                      <p className="text-xs text-gray-500">{m.unit === 'count' ? `${m.value} items` : `${m.value.toFixed(2)} ${m.unit}`}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => copyMeasurement(m)} className="p-1 text-gray-400 hover:text-gray-700" title="Copy value"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => removeMeasurement(m.id)} className="p-1 text-gray-300 hover:text-red-500" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
