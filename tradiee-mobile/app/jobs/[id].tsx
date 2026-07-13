import { useState, useEffect, useCallback, useMemo, useRef, type RefObject } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, Image, Linking, Platform, KeyboardAvoidingView,
} from 'react-native'
import { useLocalSearchParams, router, Stack, useFocusEffect } from 'expo-router'
import { useQuery } from '@powersync/react'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as ImagePicker from 'expo-image-picker'
import { WebView } from 'react-native-webview'
import { supabase } from '@/lib/supabase'
import { PriceListDescriptionInput, type PriceListLookupItem } from '@/components/PriceListDescriptionInput'
import { getJobStatuses, resolveStatus, statusHex, DEFAULT_JOB_STATUSES, type JobStatus } from '@/lib/job-statuses'
import { useTimezone } from '@/lib/profile-context'
import { formatDate as formatDateTz, formatDateTime as formatDateTimeTz } from '@/lib/datetime'
import { colors, radius, shadow } from '@/lib/theme'
import { tap as hapticTap, success as hapticSuccess } from '@/lib/haptics'
import { scrollFieldAboveKeyboard } from '@/lib/keyboard'
import { Icon } from '@/lib/icons'
import { TimeEntryEditModal, type EditableTimeEntry } from '@/components/timesheets/TimeEntryEditModal'
import { ScheduleVisitModal } from '@/components/schedule/ScheduleVisitModal'

// Self-contained HTML signature pad — draws to a canvas and posts a PNG data URL
// (or 'EMPTY' if untouched) back to React Native.
const SIGNATURE_HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
 html,body{margin:0;height:100%;overflow:hidden;font-family:-apple-system,sans-serif}
 #wrap{display:flex;flex-direction:column;height:100%}
 #pad{flex:1;touch-action:none;background:#fff;border-bottom:1px dashed #d1d5db}
 #bar{display:flex;gap:8px;padding:10px}
 button{flex:1;padding:14px;border:0;border-radius:10px;font-size:15px;font-weight:700}
 #clear{background:#e5e7eb;color:#374151}
 #save{background:#22c55e;color:#fff}
</style></head>
<body><div id="wrap">
 <canvas id="pad"></canvas>
 <div id="bar"><button id="clear">Clear</button><button id="save">Save & complete</button></div>
</div>
<script>
 var c=document.getElementById('pad'),ctx=c.getContext('2d'),drawing=false,dirty=false;
 function resize(){var r=c.getBoundingClientRect();c.width=r.width*2;c.height=r.height*2;ctx.scale(2,2);ctx.lineWidth=2.5;ctx.lineCap='round';ctx.strokeStyle='#111'}
 function pos(e){var r=c.getBoundingClientRect();var t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top}}
 function start(e){drawing=true;dirty=true;var p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault()}
 function move(e){if(!drawing)return;var p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault()}
 function end(){drawing=false}
 c.addEventListener('touchstart',start);c.addEventListener('touchmove',move);c.addEventListener('touchend',end);
 c.addEventListener('mousedown',start);c.addEventListener('mousemove',move);c.addEventListener('mouseup',end);
 document.getElementById('clear').onclick=function(){ctx.clearRect(0,0,c.width,c.height);dirty=false};
 document.getElementById('save').onclick=function(){window.ReactNativeWebView.postMessage(dirty?c.toDataURL('image/png'):'EMPTY')};
 window.addEventListener('load',resize);
</script></body></html>`

const ACTIVE_JOB_KEY = 'TRADIEE_ACTIVE_JOB'
type ActiveJob = { jobId: string; timesheetId: string; startedAt: string }
type OpenTimesheet = { id: string; job_id: string | null; started_at: string }

// Visit statuses are a fixed enum (not the company's custom job statuses).
const VISIT_STATUS_COLOR: Record<string, string> = {
  unscheduled: '#6b7280',
  scheduled:   '#3b82f6',
  in_progress: '#f97316',
  on_hold:     '#eab308',
  completed:   '#22c55e',
  cancelled:   '#ef4444',
}

type Job = {
  id: string
  job_number: string
  title: string
  description: string | null
  status: string
  customer_id: string | null
  customer_name: string | null
  customer_phone: string | null
  customer_billing_address: string | null
  site_address: string | null
  site_lat: number | null
  site_lng: number | null
  assigned_to: string | null
  created_at: string
}

type Note = { id: string; body: string; author_id: string | null; created_at: string }
type Material = { id: string; description: string; quantity: number; unit: string | null; unit_price: number }
type MaterialLine = { price_list_item_id: string | null; description: string; quantity: string; unit: string; unit_cost: string; unit_price: string }
type KitComponent = { quantity: number; price_list_items: { id: string; name: string; unit: string | null; cost_price: number | null; sell_price: number | null } | null }
type Kit = { id: string; code: string | null; name: string; sell_price: number | null; use_item_sell_total: boolean | null; kit_items: KitComponent[] }
type MatInsert = { job_id: string; company_id: string; added_by: string | null; price_list_item_id: string | null; description: string; quantity: number; unit: string; unit_cost: number; unit_price: number }
type Visit = { id: string; scheduled_start: string; scheduled_end: string | null; status: string }
type JobInvoice = { id: string; invoice_number: string; status: string; total: number; amount_paid: number; invoice_date: string | null }
type TimeLogEntry = { id: string; job_id: string | null; started_at: string; ended_at: string | null; break_minutes: number; notes: string | null }
type PickerJob = { id: string; job_number: string; title: string }
type Photo = { id: string; storage_path: string; caption: string | null; taken_at: string }
type FormField = { id: string; type: string; label: string; required: boolean; options?: string[] }
type FormTemplate = { id: string; name: string; fields: string; is_active: number }
type FormSubmission = { id: string; template_id: string | null; template_name: string; answers: string; submitted_at: string | null }

export default function JobDetailScreen() {
  const timezone = useTimezone()
  const formatDate = (iso: string) => formatDateTz(iso, timezone, { month: 'short', day: 'numeric', year: 'numeric' })
  const formatDateTime = (iso: string) => formatDateTimeTz(iso, timezone, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const { id, openSchedule } = useLocalSearchParams<{ id: string; openSchedule?: string }>()
  const [showAddNote, setShowAddNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [materialLine, setMaterialLine] = useState<MaterialLine>({ price_list_item_id: null, description: '', quantity: '1', unit: 'ea', unit_cost: '0', unit_price: '' })
  const [savingMaterial, setSavingMaterial] = useState(false)
  const [optimisticMaterials, setOptimisticMaterials] = useState<Material[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [showKitPicker, setShowKitPicker] = useState(false)
  const [addingKit, setAddingKit] = useState(false)
  const [showStatusPicker, setShowStatusPicker] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null)
  const [togglingTimer, setTogglingTimer] = useState(false)
  const [elapsed, setElapsed] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [statuses, setStatuses] = useState<JobStatus[]>(DEFAULT_JOB_STATUSES)
  const [showComplete, setShowComplete] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [fillTemplate, setFillTemplate] = useState<FormTemplate | null>(null)
  const [fillAnswers, setFillAnswers] = useState<Record<string, string>>({})
  const [savingForm, setSavingForm] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showScheduleVisit, setShowScheduleVisit] = useState(false)
  const [invMode, setInvMode] = useState<'full' | 'actuals' | 'deposit' | 'progress'>('full')
  const [invPct, setInvPct] = useState('50')
  const [invAmount, setInvAmount] = useState('')
  const [invDepositUnit, setInvDepositUnit] = useState<'$' | '%'>('$')
  const [invoicing, setInvoicing] = useState(false)
  const [formsY, setFormsY] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const noteInputRef = useRef<TextInput>(null)
  const materialQtyRef = useRef<TextInput>(null)
  const materialUnitRef = useRef<TextInput>(null)
  const materialPriceRef = useRef<TextInput>(null)

  const focusField = (ref: RefObject<TextInput | null>) => {
    setTimeout(() => scrollFieldAboveKeyboard(scrollRef, ref, 12), 50)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('company_id').eq('id', user.id).single()
        .then(({ data: profile }) => {
          if (profile?.company_id) {
            setCompanyId(profile.company_id)
            getJobStatuses(profile.company_id).then(setStatuses)
            supabase.from('companies').select('name, logo_url').eq('id', profile.company_id).single()
              .then(({ data: company }) => {
                setCompanyName(company?.name ?? null)
                setCompanyLogoUrl(company?.logo_url ?? null)
              })
          }
        })
    })
  }, [])

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(ACTIVE_JOB_KEY).then(raw => {
      let aj: ActiveJob | null = null
      if (raw) {
        try {
          aj = JSON.parse(raw)
        } catch {
          AsyncStorage.removeItem(ACTIVE_JOB_KEY)
        }
      }
      setActiveJob(aj?.jobId === id ? aj : null)
    })
  }, [id]))

  useEffect(() => {
    if (!activeJob) { setElapsed(''); return }
    const tick = () => {
      const mins = Math.round((Date.now() - new Date(activeJob.startedAt).getTime()) / 60000)
      setElapsed(`${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    tick()
    const t = setInterval(tick, 60000)
    return () => clearInterval(t)
  }, [activeJob])

  async function startJob() {
    setTogglingTimer(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setTogglingTimer(false); return }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
    const now = new Date().toISOString()
    const reconcileOpenTimer = async () => {
      const { data: open } = await supabase
        .from('timesheets')
        .select('id, job_id, started_at')
        .eq('profile_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!open) return false
      const existingOpen = open as OpenTimesheet
      const aj: ActiveJob = { jobId: existingOpen.job_id ?? id!, timesheetId: existingOpen.id, startedAt: existingOpen.started_at }
      await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(aj))
      if (existingOpen.job_id === id) setActiveJob(aj)
      else Alert.alert('Timer already running', 'Stop your current job timer before starting another one.')
      return true
    }
    const { data: existing } = await supabase
      .from('timesheets')
      .select('id, job_id, started_at')
      .eq('profile_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      const existingOpen = existing as OpenTimesheet
      const aj: ActiveJob = { jobId: existingOpen.job_id ?? id!, timesheetId: existingOpen.id, startedAt: existingOpen.started_at }
      await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(aj))
      if (existingOpen.job_id === id) setActiveJob(aj)
      else Alert.alert('Timer already running', 'Stop your current job timer before starting another one.')
      setTogglingTimer(false)
      return
    }
    const { data, error } = await supabase.from('timesheets').insert({
      job_id: id, profile_id: user.id, company_id: profile?.company_id,
      started_at: now, is_billable: true,
    }).select('id').single()
    if (error) {
      if ((error as { code?: string }).code === '23505' && await reconcileOpenTimer()) {
        setTogglingTimer(false)
        return
      }
      Alert.alert('Error', error.message)
      setTogglingTimer(false)
      return
    }
    const aj: ActiveJob = { jobId: id!, timesheetId: data.id, startedAt: now }
    await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(aj))
    setActiveJob(aj)
    setTogglingTimer(false)
    hapticTap()
  }

  async function stopJob() {
    if (!activeJob) return
    setTogglingTimer(true)
    const { error } = await supabase.from('timesheets')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', activeJob.timesheetId)
    if (error) { Alert.alert('Error', error.message); setTogglingTimer(false); return }
    await AsyncStorage.removeItem(ACTIVE_JOB_KEY)
    setActiveJob(null)
    setTogglingTimer(false)
    hapticTap()
  }

  const { data: jobs, isLoading, refresh: refreshJob } = useQuery<Job>(
    `SELECT j.id, j.job_number, j.title, j.description, j.status, j.assigned_to, j.created_at, j.customer_id,
            c.name AS customer_name, c.phone AS customer_phone,
            c.billing_address AS customer_billing_address,
            s.address AS site_address, s.lat AS site_lat, s.lng AS site_lng
     FROM jobs j
     LEFT JOIN customers c ON c.id = j.customer_id
     LEFT JOIN customer_sites s ON s.id = j.site_id
     WHERE j.id = ?`,
    [id]
  )
  const job = jobs?.[0]
  const jobAddress = job?.site_address ?? job?.customer_billing_address ?? null

  // Auto-open the schedule sheet when arriving from "Schedule now" on quote
  // conversion (?openSchedule=1) — one-shot, only fires once job data is ready.
  useEffect(() => {
    if (openSchedule === '1' && job) setShowScheduleVisit(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSchedule, !!job])

  function callPhone(phone: string) {
    Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() =>
      Alert.alert('Could not place call', phone)
    )
  }

  function openInMaps() {
    // Prefer exact coordinates when geocoded; otherwise hand the address string to
    // the platform's default maps app (Apple Maps on iOS, Google Maps on Android).
    const hasCoords = job?.site_lat != null && job?.site_lng != null
    const label = encodeURIComponent(jobAddress ?? job?.customer_name ?? 'Job')
    let url: string
    if (Platform.OS === 'ios') {
      url = hasCoords
        ? `http://maps.apple.com/?ll=${job!.site_lat},${job!.site_lng}&q=${label}`
        : `http://maps.apple.com/?q=${encodeURIComponent(jobAddress ?? '')}`
    } else {
      url = hasCoords
        ? `geo:${job!.site_lat},${job!.site_lng}?q=${job!.site_lat},${job!.site_lng}(${label})`
        : `geo:0,0?q=${encodeURIComponent(jobAddress ?? '')}`
    }
    Linking.openURL(url).catch(() => Alert.alert('Could not open maps', jobAddress ?? ''))
  }

  const { data: notes, refresh: refreshNotes } = useQuery<Note>(
    `SELECT id, body, author_id, created_at FROM job_notes
     WHERE job_id = ? ORDER BY created_at DESC`,
    [id]
  )

  const { data: materials, refresh: refreshMaterials } = useQuery<Material>(
    `SELECT id, description, quantity, unit, unit_price
     FROM job_materials WHERE job_id = ?
     ORDER BY created_at ASC`,
    [id]
  )

  useEffect(() => {
    if (!materials?.length) return
    setOptimisticMaterials(prev => prev.filter(pending => !materials.some(m => m.id === pending.id)))
  }, [materials])

  const { data: jobInvoices, refresh: refreshInvoices } = useQuery<JobInvoice>(
    `SELECT id, invoice_number, status, total, amount_paid, invoice_date
     FROM invoices WHERE job_id = ?
     ORDER BY invoice_date ASC, created_at ASC`,
    [id]
  )

  const { data: jobTimesheets, refresh: refreshTimesheets } = useQuery<TimeLogEntry>(
    `SELECT id, job_id, started_at, ended_at, break_minutes, notes
     FROM timesheets WHERE job_id = ?
     ORDER BY started_at DESC`,
    [id]
  )
  const [editingTimeEntry, setEditingTimeEntry] = useState<EditableTimeEntry | null>(null)

  const { data: pickerJobs } = useQuery<PickerJob>(
    `SELECT id, job_number, title FROM jobs WHERE company_id = ? ORDER BY job_number`,
    [companyId ?? '']
  )

  const { data: priceItems } = useQuery<PriceListLookupItem>(
    `SELECT id, name, unit, sell_price, cost_price, category
     FROM price_list_items
     WHERE company_id = ? AND is_active = 1
     ORDER BY name ASC`,
    [companyId ?? '']
  )

  const { data: visits, refresh: refreshVisits } = useQuery<Visit>(
    `SELECT id, scheduled_start, scheduled_end, status
     FROM job_visits WHERE job_id = ?
     ORDER BY scheduled_start ASC`,
    [id]
  )

  const { data: photos, refresh: refreshPhotos } = useQuery<Photo>(
    `SELECT id, storage_path, caption, taken_at FROM job_photos
     WHERE job_id = ? ORDER BY taken_at ASC`,
    [id]
  )

  const { data: formTemplates } = useQuery<FormTemplate>(
    `SELECT id, name, fields, is_active FROM form_templates
     WHERE company_id = ? AND is_active = 1 ORDER BY name ASC`,
    [companyId ?? '']
  )

  const { data: formSubmissions, refresh: refreshFormSubmissions } = useQuery<FormSubmission>(
    `SELECT id, template_id, template_name, answers, submitted_at FROM form_submissions
     WHERE job_id = ?`,
    [id]
  )

  function submissionFor(templateId: string) {
    return (formSubmissions ?? []).find(s => s.template_id === templateId)
  }

  function openForm(template: FormTemplate) {
    const existing = submissionFor(template.id)
    setFillAnswers(existing ? JSON.parse(existing.answers || '{}') : {})
    setFillTemplate(template)
  }

  async function saveForm() {
    if (!fillTemplate || !companyId) return
    setSavingForm(true)
    try {
      const existing = submissionFor(fillTemplate.id)
      const payload = {
        job_id: id,
        company_id: companyId,
        template_id: fillTemplate.id,
        template_name: fillTemplate.name,
        answers: fillAnswers,
        submitted_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        submitted_at: new Date().toISOString(),
      }
      const { error } = existing
        ? await supabase.from('form_submissions').update(payload).eq('id', existing.id)
        : await supabase.from('form_submissions').insert(payload)
      if (error) throw new Error(error.message)
      refreshFormSubmissions?.()
      hapticSuccess()
      setFillTemplate(null)
    } catch (e: any) {
      Alert.alert('Could not save form', e.message ?? 'Unknown error')
    } finally {
      setSavingForm(false)
    }
  }

  useEffect(() => {
    if (!photos?.length) return
    // Job photos live in the public R2 bucket — build the URL from the key.
    const base = (process.env.EXPO_PUBLIC_R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '')
    setPhotoUrls(prev => {
      const next = { ...prev }
      photos.forEach(p => { if (!next[p.id]) next[p.id] = `${base}/${p.storage_path}` })
      return next
    })
  }, [photos])

  async function addPhoto(source: 'camera' | 'gallery') {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', `Please allow ${source} access in Settings.`)
      return
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsMultipleSelection: false, mediaTypes: ImagePicker.MediaTypeOptions.Images })
    if (result.canceled || !result.assets[0]) return

    setUploadingPhoto(true)
    try {
      const asset = result.assets[0]
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase()
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`

      // Get a presigned R2 upload URL from the web API (bearer-authenticated)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not signed in')
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const signRes = await fetch(`${apiBase}/api/storage/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind: 'job-photo', jobId: id, ext, contentType }),
      })
      if (!signRes.ok) throw new Error((await signRes.json()).error ?? 'Could not get upload URL')
      const { url, key } = await signRes.json()

      const fileBody = {
        uri: asset.uri,
        name: `job-photo.${ext}`,
        type: contentType,
      } as unknown as BodyInit
      const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: fileBody })
      if (!put.ok) throw new Error('Upload to storage failed')

      const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single()
      await supabase.from('job_photos').insert({
        job_id: id, uploaded_by: session.user.id, company_id: profile?.company_id,
        storage_path: key, taken_at: new Date().toISOString(),
      })
      refreshPhotos?.()
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Unknown error')
    } finally {
      setUploadingPhoto(false)
    }
  }

  function promptPhotoSource() {
    Alert.alert('Add Photo', 'Choose source', [
      { text: 'Camera', onPress: () => addPhoto('camera') },
      { text: 'Photo Library', onPress: () => addPhoto('gallery') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function addMaterial() {
    if (!companyId || !materialLine.description.trim()) return
    const qty = parseFloat(materialLine.quantity) || 1
    const unitCost = parseFloat(materialLine.unit_cost) || 0
    const unitPrice = parseFloat(materialLine.unit_price) || 0
    setSavingMaterial(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      job_id: id,
      company_id: companyId,
      added_by: user?.id ?? null,
      price_list_item_id: materialLine.price_list_item_id,
      description: materialLine.description.trim(),
      quantity: qty,
      unit: materialLine.unit || 'ea',
      unit_cost: unitCost,
      unit_price: unitPrice,
    }
    const { data, error } = await supabase
      .from('job_materials')
      .insert(payload)
      .select('id, description, quantity, unit, unit_price')
      .single()
    setSavingMaterial(false)
    if (error) { Alert.alert('Could not add material', error.message); return }
    setOptimisticMaterials(prev => [
      ...prev,
      data ?? {
        id: `pending-${Date.now()}`,
        description: payload.description,
        quantity: payload.quantity,
        unit: payload.unit,
        unit_price: payload.unit_price,
      },
    ])
    setMaterialLine({ price_list_item_id: null, description: '', quantity: '1', unit: 'ea', unit_cost: '0', unit_price: '' })
    refreshMaterials?.()
    hapticSuccess()
  }

  // Kits aren't synced to the device (sync-rules.yaml only carries
  // price_list_items), so fetch them online — consistent with addMaterial,
  // which already writes job_materials straight to Supabase, not the offline
  // queue, so the screen is online whenever items get added anyway.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    supabase
      .from('kits')
      .select('id, code, name, sell_price, use_item_sell_total, kit_items(quantity, price_list_items(id, name, unit, cost_price, sell_price))')
      .eq('company_id', companyId)
      .order('name')
      .then(({ data }) => { if (!cancelled) setKits((data as Kit[] | null) ?? []) })
    return () => { cancelled = true }
  }, [companyId])

  // Bundle = one aggregate "kit" line at the kit price. Split = one editable,
  // stock-tracked line per component, so a tech can swap/delete a single part
  // on site. Both consume component stock identically.
  async function addKit(kit: Kit, mode: 'bundle' | 'split') {
    if (!companyId || addingKit) return
    const components = kit.kit_items.filter(ki => ki.price_list_items)
    if (components.length === 0) return
    setAddingKit(true)
    const { data: { user } } = await supabase.auth.getUser()
    const compRows: MatInsert[] = components.map(ki => {
      const p = ki.price_list_items!
      return {
        job_id: id, company_id: companyId, added_by: user?.id ?? null,
        price_list_item_id: p.id, description: p.name, quantity: Number(ki.quantity),
        unit: p.unit || 'ea', unit_cost: Number(p.cost_price) || 0,
        unit_price: Number(p.sell_price) || Number(p.cost_price) || 0,
      }
    })
    let rows: MatInsert[]
    if (mode === 'split') {
      rows = compRows
    } else {
      const kitCost = compRows.reduce((s, r) => s + r.unit_cost * r.quantity, 0)
      const kitSell = kit.use_item_sell_total
        ? compRows.reduce((s, r) => s + r.unit_price * r.quantity, 0)
        : Number(kit.sell_price) || 0
      rows = [{
        job_id: id, company_id: companyId, added_by: user?.id ?? null,
        price_list_item_id: null, description: kit.code ? `${kit.name} (${kit.code})` : kit.name,
        quantity: 1, unit: 'kit', unit_cost: Number(kitCost.toFixed(2)), unit_price: Number(kitSell.toFixed(2)),
      }]
    }
    const { data, error } = await supabase
      .from('job_materials')
      .insert(rows)
      .select('id, description, quantity, unit, unit_price')
    setAddingKit(false)
    setShowKitPicker(false)
    if (error) { Alert.alert('Could not add kit', error.message); return }
    setOptimisticMaterials(prev => [...prev, ...((data as Material[] | null) ?? [])])
    await supabase.rpc('consume_price_list_stock', {
      p_company_id: companyId,
      p_lines: components.map(ki => ({ item_id: ki.price_list_items!.id, quantity: Number(ki.quantity) })),
    })
    refreshMaterials?.()
    hapticSuccess()
  }

  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('job_notes').insert({
      job_id: id,
      author_id: user?.id,
      body: noteText.trim(),
    })
    setSavingNote(false)
    if (error) { Alert.alert('Error', error.message); return }
    setNoteText('')
    setShowAddNote(false)
    refreshNotes?.()
  }

  async function updateStatus(newStatus: string) {
    setUpdatingStatus(true)
    setShowStatusPicker(false)
    const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', id)
    setUpdatingStatus(false)
    if (error) Alert.alert('Error', error.message)
    else refreshJob?.()
  }

  // Complete the job: optionally upload a customer signature, then set the job to
  // the company's terminal ("done") status. `signature` is a PNG data URL or 'EMPTY'.
  async function finishComplete(signature: string | null) {
    setCompleting(true)
    try {
      if (signature && signature !== 'EMPTY') {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not signed in')
        const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
        const res = await fetch(`${apiBase}/api/storage/signature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ jobId: id, dataBase64: signature }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Could not save signature')
      }
      const doneKey = (statuses.find(s => s.is_terminal && s.key !== 'cancelled') ?? statuses.find(s => s.key === 'completed'))?.key
      if (doneKey) {
        const { error } = await supabase.from('jobs').update({ status: doneKey }).eq('id', id)
        if (error) throw new Error(error.message)
      }
      if (activeJob) await stopJob()
      refreshJob?.()
      setShowComplete(false)
      hapticSuccess()
      Alert.alert('Job completed', signature && signature !== 'EMPTY' ? 'Customer sign-off saved.' : 'Status set to complete.')
    } catch (e: any) {
      Alert.alert('Could not complete', e.message ?? 'Unknown error')
    } finally {
      setCompleting(false)
    }
  }

  function promptCompleteWithSignoff() {
    if ((photos ?? []).length === 0) {
      Alert.alert(
        'No photos yet',
        'Would you like to add photos before completing?',
        [
          { text: 'Add photos', onPress: promptPhotoSource },
          { text: 'Skip & continue', onPress: () => setShowComplete(true) },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
    } else {
      setShowComplete(true)
    }
  }

  function promptCompleteAndInvoice() {
    if ((photos ?? []).length === 0) {
      Alert.alert(
        'No photos yet',
        'Would you like to add photos before completing?',
        [
          { text: 'Add photos', onPress: promptPhotoSource },
          { text: 'Skip & continue', onPress: () => completeAndInvoice() },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
    } else {
      completeAndInvoice()
    }
  }

  async function completeAndInvoice() {
    setCompleting(true)
    try {
      const doneKey = (statuses.find(s => s.is_terminal && s.key !== 'cancelled') ?? statuses.find(s => s.key === 'completed'))?.key
      if (doneKey) {
        const { error } = await supabase.from('jobs').update({ status: doneKey }).eq('id', id)
        if (error) throw new Error(error.message)
      }
      if (activeJob) await stopJob()
      refreshJob?.()

      // Create draft invoice via API
      const { data: { session } } = await supabase.auth.getSession()
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ job_id: id }),
      })
      const inv = await res.json()
      if (!res.ok) throw new Error(inv.error ?? 'Could not create invoice')

      hapticSuccess()
      Alert.alert('Invoice created', `Draft invoice ${inv.invoice_number} created.`, [
        { text: 'View invoice', onPress: () => router.push(`/invoices/${inv.id}`) },
        { text: 'OK' },
      ])
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not complete job')
    } finally {
      setCompleting(false)
    }
  }

  async function createInvoice(force = false) {
    const payload: Record<string, unknown> = { job_id: id, force }
    if (invMode === 'full') {
      payload.type = 'full'
    } else if (invMode === 'actuals') {
      payload.type = 'materials'
    } else if (invMode === 'progress') {
      const pct = parseFloat(invPct)
      if (!pct || pct <= 0 || pct > 100) { Alert.alert('Enter a percentage', 'Progress claims need a percentage between 1 and 100.'); return }
      payload.type = 'progress'
      payload.progress_pct = pct
    } else {
      payload.type = 'deposit'
      if (invDepositUnit === '$') {
        const amt = parseFloat(invAmount)
        if (!amt || amt <= 0) { Alert.alert('Enter an amount', 'Enter the deposit amount in dollars.'); return }
        payload.deposit_amount = amt
      } else {
        const pct = parseFloat(invAmount)
        if (!pct || pct <= 0 || pct > 100) { Alert.alert('Enter a percentage', 'Enter the deposit as a percentage of the quote (1–100).'); return }
        payload.progress_pct = pct
      }
    }
    setInvoicing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const apiBase = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(payload),
      })
      const inv = await res.json()
      if (res.status === 409 && inv.confirm) {
        setInvoicing(false)
        Alert.alert('Bill above the quote?', `${inv.error}\n\nBill above the quote (e.g. extra time or variations)?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Bill anyway', style: 'destructive', onPress: () => createInvoice(true) },
        ])
        return
      }
      if (!res.ok) throw new Error(inv.error ?? 'Could not create invoice')
      hapticSuccess()
      setShowInvoice(false)
      refreshInvoices?.()
      router.push(`/invoices/${inv.id}`)
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not create invoice')
    } finally {
      setInvoicing(false)
    }
  }

  const displayedMaterials = useMemo(() => {
    const synced = materials ?? []
    const syncedIds = new Set(synced.map(m => m.id))
    return [...synced, ...optimisticMaterials.filter(m => !syncedIds.has(m.id))]
  }, [materials, optimisticMaterials])
  const displayedMaterialsTotal = displayedMaterials.reduce((sum, m) => sum + m.quantity * m.unit_price, 0)

  // Financials: what's been invoiced vs paid on this job. Void invoices don't count.
  const liveInvoices = (jobInvoices ?? []).filter(i => i.status !== 'void')
  const invoicedTotal = liveInvoices.reduce((s, i) => s + (i.total ?? 0), 0)
  const paidTotal = liveInvoices.reduce((s, i) => s + (i.amount_paid ?? 0), 0)
  const outstandingTotal = invoicedTotal - paidTotal

  function formatTimeLogDuration(start: string, end: string | null, breakMin = 0) {
    if (!end) return 'In progress'
    const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000) - breakMin)
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }
  const totalLoggedHours = (jobTimesheets ?? []).reduce((sum, t) => {
    if (!t.ended_at) return sum
    const mins = (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime()) / 60000 - (t.break_minutes ?? 0)
    return sum + Math.max(0, mins) / 60
  }, 0)

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f97316" />
      </View>
    )
  }

  if (!job) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6b7280' }}>Job not found</Text>
      </View>
    )
  }

  const otherStatuses = statuses.filter(s => s.key !== job.status)
  const current = resolveStatus(statuses, job.status)
  const doneStatus = statuses.find(s => s.is_terminal && s.key !== 'cancelled') ?? statuses.find(s => s.key === 'completed')
  const isDone = doneStatus ? job.status === doneStatus.key : false

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
      <Stack.Screen options={{ title: job.job_number, headerTintColor: '#f97316' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 260 }} keyboardShouldPersistTaps="handled">

        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobNumber}>{job.job_number}</Text>
              <Text style={styles.title}>{job.title}</Text>
            </View>
            <TouchableOpacity
              style={[styles.statusBadge, { backgroundColor: current.hex + '20' }]}
              onPress={() => otherStatuses.length > 0 && setShowStatusPicker(true)}
              activeOpacity={otherStatuses.length > 0 ? 0.7 : 1}
            >
              {updatingStatus
                ? <ActivityIndicator size="small" color={current.hex} />
                : <Text style={[styles.statusText, { color: current.hex }]}>{current.label}</Text>
              }
            </TouchableOpacity>
          </View>

          {job.description && (
            <Text style={styles.description}>{job.description}</Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Customer</Text>
            <Text style={styles.metaValue}>{job.customer_name ?? '—'}</Text>
          </View>
          {job.customer_phone && (
            <TouchableOpacity style={styles.metaRow} onPress={() => callPhone(job.customer_phone!)} activeOpacity={0.6}>
              <Text style={styles.metaLabel}>Phone</Text>
              <Text style={[styles.metaValue, styles.metaLink]}>{job.customer_phone}</Text>
            </TouchableOpacity>
          )}
          {jobAddress && (
            <TouchableOpacity style={styles.metaRow} onPress={openInMaps} activeOpacity={0.6}>
              <Text style={styles.metaLabel}>Address</Text>
              <Text style={[styles.metaValue, styles.metaLink]}>{jobAddress}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>{formatDate(job.created_at)}</Text>
          </View>

          {doneStatus && !isDone && (
            <View style={{ gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={styles.completeBtn} onPress={promptCompleteWithSignoff} activeOpacity={0.85}>
                <Text style={styles.completeBtnText}>✓ Complete &amp; get sign-off</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.completeBtn, { backgroundColor: '#f97316' }]}
                onPress={promptCompleteAndInvoice}
                activeOpacity={0.85}
              >
                <Text style={styles.completeBtnText}>✓ Complete &amp; Invoice</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Status stepper — visualises the lifecycle at a glance (finding #9) */}
        {statuses.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stepperWrap} contentContainerStyle={{ paddingHorizontal: 4 }}>
            {statuses.map((st, i) => {
              const curIdx = statuses.findIndex(s => s.key === job.status)
              const state = i < curIdx ? 'done' : i === curIdx ? 'cur' : 'future'
              return (
                <View key={st.key} style={styles.step}>
                  {i > 0 && <View style={[styles.stepBar, state !== 'future' && { backgroundColor: colors.success }]} />}
                  <View style={[
                    styles.stepDot,
                    state === 'done' && { backgroundColor: colors.success },
                    state === 'cur' && { backgroundColor: statusHex(st.color) },
                  ]}>
                    <Text style={styles.stepDotText}>{state === 'done' ? '✓' : i + 1}</Text>
                  </View>
                  <Text style={[styles.stepLabel, state === 'cur' && { color: statusHex(st.color), fontWeight: '800' }]} numberOfLines={1}>{st.label}</Text>
                </View>
              )
            })}
          </ScrollView>
        )}

        {/* Quick actions — one-handed, on-site (brief §9) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickWrap} contentContainerStyle={{ paddingHorizontal: 4, gap: 9 }}>
          <TouchableOpacity
            style={[styles.qbtn, styles.qbtnHot]}
            onPress={() => { hapticTap(); router.push(`/on-my-way?jobId=${id}`) }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="On my way — send ETA to customer"
          >
            <Icon name="car" size={19} color={colors.brandDark} /><Text style={[styles.qbtnLabel, { color: colors.brandDark }]}>On my way</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qbtn}
            onPress={() => { hapticTap(); openInMaps() }}
            disabled={!jobAddress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Navigate to job site"
          >
            <Icon name="navigation" size={19} color={colors.ink} /><Text style={styles.qbtnLabel}>Navigate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qbtn}
            onPress={() => { hapticTap(); job.customer_phone && callPhone(job.customer_phone) }}
            disabled={!job.customer_phone}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Call customer"
          >
            <Icon name="phone" size={19} color={colors.ink} /><Text style={styles.qbtnLabel}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qbtn}
            disabled={!job.customer_id}
            onPress={() => { hapticTap(); job.customer_id && router.push(`/messages/${encodeURIComponent(`sms:${job.customer_id}`)}`) }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Message customer"
          >
            <Icon name="message-square" size={19} color={colors.ink} /><Text style={styles.qbtnLabel}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qbtn}
            onPress={() => { hapticTap(); promptPhotoSource() }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
          >
            <Icon name="camera" size={19} color={colors.ink} /><Text style={styles.qbtnLabel}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qbtn}
            onPress={() => { hapticTap(); scrollRef.current?.scrollTo({ y: formsY, animated: true }) }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Jump to forms"
          >
            <Icon name="clipboard-list" size={19} color={colors.ink} /><Text style={styles.qbtnLabel}>Forms</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qbtn}
            onPress={() => { hapticTap(); setShowInvoice(true) }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Invoice this job"
          >
            <Icon name="dollar-sign" size={19} color={colors.ink} /><Text style={styles.qbtnLabel}>Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qbtn}
            onPress={() => { hapticTap(); setShowScheduleVisit(true) }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Schedule a visit for this job"
          >
            <Icon name="calendar" size={19} color={colors.ink} /><Text style={styles.qbtnLabel}>Schedule</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Materials / line items — directly above Forms */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Materials</Text>
          <View style={styles.materialAddBox}>
            <PriceListDescriptionInput
              value={materialLine.description}
              items={priceItems ?? []}
              onChangeText={value => setMaterialLine(line => ({ ...line, description: value, price_list_item_id: null }))}
              onPick={item => setMaterialLine(line => ({
                ...line,
                price_list_item_id: item.id,
                description: item.name,
                unit: item.unit || 'ea',
                unit_cost: String(Number(item.cost_price) || 0),
                unit_price: String(Number(item.sell_price) || 0),
              }))}
              inputStyle={[styles.input, { marginBottom: 0 }]}
              containerStyle={{ marginBottom: 8 }}
              placeholder="Description"
              scrollViewRef={scrollRef}
            />
            <View style={styles.materialInputsRow}>
              <TextInput
                ref={materialQtyRef}
                style={[styles.input, styles.materialSmallInput]}
                value={materialLine.quantity}
                onChangeText={value => setMaterialLine(line => ({ ...line, quantity: value }))}
                placeholder="Qty"
                placeholderTextColor="#6b7280"
                keyboardType="decimal-pad"
                onFocus={() => focusField(materialQtyRef)}
              />
              <TextInput
                ref={materialUnitRef}
                style={[styles.input, styles.materialSmallInput]}
                value={materialLine.unit}
                onChangeText={value => setMaterialLine(line => ({ ...line, unit: value }))}
                placeholder="Unit"
                placeholderTextColor="#6b7280"
                onFocus={() => focusField(materialUnitRef)}
              />
              <TextInput
                ref={materialPriceRef}
                style={[styles.input, { flex: 1.4 }]}
                value={materialLine.unit_price}
                onChangeText={value => setMaterialLine(line => ({ ...line, unit_price: value }))}
                placeholder="Unit price"
                placeholderTextColor="#6b7280"
                keyboardType="decimal-pad"
                onFocus={() => focusField(materialPriceRef)}
              />
            </View>
            <View style={styles.materialActions}>
              <TouchableOpacity
                style={[styles.saveNoteBtn, (!materialLine.description.trim() || savingMaterial) && { opacity: 0.5 }]}
                onPress={addMaterial}
                disabled={!materialLine.description.trim() || savingMaterial}
              >
                {savingMaterial ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveNoteBtnText}>Add item</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMaterialLine({ price_list_item_id: null, description: 'Sundries', quantity: '1', unit: 'item', unit_cost: '0', unit_price: '0' })}>
                <Text style={styles.addLink}>Add sundry</Text>
              </TouchableOpacity>
              {kits.length > 0 && (
                <TouchableOpacity onPress={() => { hapticTap(); setShowKitPicker(true) }}>
                  <Text style={styles.addLink}>Add kit</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {displayedMaterials.length === 0 ? (
            <Text style={styles.emptyText}>No materials yet</Text>
          ) : (
            <>
              {displayedMaterials.map(m => (
              <View key={m.id} style={styles.materialRow}>
                <Text style={styles.materialDesc} numberOfLines={1}>{m.description}</Text>
                <Text style={styles.materialQty}>{m.quantity}{m.unit ? ` ${m.unit}` : ''}</Text>
                <Text style={styles.materialPrice}>${(m.quantity * m.unit_price).toFixed(2)}</Text>
              </View>
              ))}
              <View style={styles.materialTotal}>
                <Text style={styles.materialTotalLabel}>Total</Text>
                <Text style={styles.materialTotalValue}>${displayedMaterialsTotal.toFixed(2)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Financials — invoices raised against this job, with balance owing */}
        {liveInvoices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Financials</Text>
            {liveInvoices.map(inv => {
              const owing = (inv.total ?? 0) - (inv.amount_paid ?? 0)
              return (
                <TouchableOpacity
                  key={inv.id}
                  style={styles.materialRow}
                  onPress={() => router.push(`/invoices/${inv.id}`)}
                  activeOpacity={0.6}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.materialDesc} numberOfLines={1}>{inv.invoice_number}</Text>
                    <Text style={[styles.emptyText, { marginTop: 2 }]}>
                      {inv.status.replace('_', ' ')}{owing > 0.01 ? ` · $${owing.toFixed(2)} owing` : ''}
                    </Text>
                  </View>
                  <Text style={styles.materialPrice}>${(inv.total ?? 0).toFixed(2)}</Text>
                </TouchableOpacity>
              )
            })}
            <View style={styles.materialTotal}>
              <Text style={styles.materialTotalLabel}>Invoiced</Text>
              <Text style={styles.materialTotalValue}>${invoicedTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.materialTotal}>
              <Text style={styles.materialTotalLabel}>Paid</Text>
              <Text style={[styles.materialTotalValue, { color: '#22c55e' }]}>${paidTotal.toFixed(2)}</Text>
            </View>
            {outstandingTotal > 0.01 && (
              <View style={styles.materialTotal}>
                <Text style={styles.materialTotalLabel}>Balance owing</Text>
                <Text style={[styles.materialTotalValue, { color: '#ef4444' }]}>${outstandingTotal.toFixed(2)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Time Logged — tap an entry to fix the job, times, or a missed stop */}
        {(jobTimesheets ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time Logged</Text>
            {jobTimesheets!.map(t => (
              <TouchableOpacity
                key={t.id}
                style={styles.materialRow}
                onPress={() => setEditingTimeEntry({
                  id: t.id, job_id: t.job_id, job_number: job?.job_number ?? '', job_title: job?.title ?? '',
                  started_at: t.started_at, ended_at: t.ended_at, break_minutes: t.break_minutes, notes: t.notes,
                })}
                activeOpacity={0.6}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.materialDesc} numberOfLines={1}>{formatDateTime(t.started_at)}</Text>
                  {t.notes ? <Text style={[styles.emptyText, { marginTop: 2 }]} numberOfLines={1}>{t.notes}</Text> : null}
                </View>
                <Text style={[styles.materialPrice, !t.ended_at && { color: '#22c55e' }]}>
                  {formatTimeLogDuration(t.started_at, t.ended_at, t.break_minutes)}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={styles.materialTotal}>
              <Text style={styles.materialTotalLabel}>Total</Text>
              <Text style={styles.materialTotalValue}>{totalLoggedHours.toFixed(1)}h</Text>
            </View>
          </View>
        )}

        {/* Forms — the app's namesake, finally on the job screen */}
        <View style={styles.section} onLayout={e => setFormsY(e.nativeEvent.layout.y)}>
          <Text style={styles.sectionTitle}>Forms</Text>
          {(formTemplates ?? []).length === 0 && <Text style={styles.emptyText}>No form templates yet</Text>}
          {(formTemplates ?? []).map(t => {
            const sub = submissionFor(t.id)
            return (
              <TouchableOpacity key={t.id} style={styles.formRow} onPress={() => openForm(t)} activeOpacity={0.6}>
                <Icon name="clipboard-list" size={16} color={colors.mut} />
                <Text style={styles.formRowLabel} numberOfLines={1}>{t.name}</Text>
                <View style={[styles.formStatus, sub ? styles.formStatusDone : styles.formStatusTodo]}>
                  <Text style={[styles.formStatusText, { color: sub ? '#15803d' : colors.brandDark }]}>{sub ? 'Submitted' : 'To do'}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Visits */}
        {(visits ?? []).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visits</Text>
            {visits!.map(v => (
              <View key={v.id} style={styles.visitRow}>
                <View style={[styles.dot, { backgroundColor: VISIT_STATUS_COLOR[v.status] ?? '#9ca3af' }]} />
                <Text style={styles.visitText}>{formatDateTime(v.scheduled_start)}</Text>
                <View style={[styles.minibadge, { backgroundColor: (VISIT_STATUS_COLOR[v.status] ?? '#9ca3af') + '20' }]}>
                  <Text style={[styles.minibadgeText, { color: VISIT_STATUS_COLOR[v.status] ?? '#9ca3af' }]}>
                    {v.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Photos */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <TouchableOpacity onPress={promptPhotoSource} disabled={uploadingPhoto}>
              <Text style={styles.addLink}>{uploadingPhoto ? 'Uploading…' : '+ Add'}</Text>
            </TouchableOpacity>
          </View>
          {(photos ?? []).length === 0 && !uploadingPhoto && (
            <Text style={styles.emptyText}>No photos yet</Text>
          )}
          {uploadingPhoto && (
            <ActivityIndicator color="#f97316" style={{ marginVertical: 8 }} />
          )}
          <View style={styles.photoGrid}>
            {(photos ?? []).map(p => (
              <View key={p.id} style={styles.photoThumb}>
                {photoUrls[p.id]
                  ? <Image source={{ uri: photoUrls[p.id] }} style={styles.photoImg} />
                  : <View style={[styles.photoImg, { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }]}>
                      <ActivityIndicator size="small" color="#d1d5db" />
                    </View>
                }
              </View>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TouchableOpacity onPress={() => setShowAddNote(true)}>
              <Text style={styles.addLink}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {showAddNote && (
            <View style={styles.addNoteBox}>
              <TextInput
                ref={noteInputRef}
                style={styles.noteInput}
                multiline
                placeholder="Write a note…"
                placeholderTextColor="#6b7280"
                value={noteText}
                onChangeText={setNoteText}
                autoFocus
                onFocus={() => focusField(noteInputRef)}
              />
              <View style={styles.addNoteActions}>
                <TouchableOpacity onPress={() => setShowAddNote(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveNoteBtn, (!noteText.trim() || savingNote) && { opacity: 0.5 }]}
                  onPress={addNote}
                  disabled={!noteText.trim() || savingNote}
                >
                  <Text style={styles.saveNoteBtnText}>{savingNote ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(notes ?? []).length === 0 && !showAddNote && (
            <Text style={styles.emptyText}>No notes yet</Text>
          )}
          {(notes ?? []).map(note => (
            <View key={note.id} style={styles.noteCard}>
              <Text style={styles.noteBody}>{note.body}</Text>
              <Text style={styles.noteMeta}>
                {formatDateTime(note.created_at)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Fixed bottom timer button */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.bigTimerBtn, activeJob ? styles.bigTimerBtnStop : styles.bigTimerBtnStart]}
          onPress={activeJob ? stopJob : startJob}
          disabled={togglingTimer}
          activeOpacity={0.85}
        >
          {togglingTimer
            ? <ActivityIndicator color="#fff" size="large" />
            : <>
                <Icon name={activeJob ? 'square' : 'play'} size={28} color="#fff" />
                <View>
                  <Text style={styles.bigTimerLabel}>
                    {activeJob ? 'Stop Job Timer' : 'Start Job Timer'}
                  </Text>
                  {activeJob && elapsed ? (
                    <Text style={styles.bigTimerElapsed}>{elapsed} elapsed</Text>
                  ) : null}
                </View>
              </>
          }
        </TouchableOpacity>
      </SafeAreaView>

      {/* Complete job + customer signature modal */}
      <Modal visible={showComplete} transparent animationType="slide" onRequestClose={() => !completing && setShowComplete(false)}>
        <View style={styles.completeOverlay}>
          <SafeAreaView edges={['top', 'bottom']} style={styles.completeSheet}>
            <View style={styles.completeHeader}>
              <View style={{ flex: 1 }}>
                {companyLogoUrl ? <Image source={{ uri: companyLogoUrl }} style={styles.signoffLogo} resizeMode="contain" /> : null}
                {!companyLogoUrl && companyName ? <Text style={styles.signoffCompany}>{companyName}</Text> : null}
                <Text style={styles.completeTitle}>Customer sign-off</Text>
              </View>
              <TouchableOpacity onPress={() => !completing && setShowComplete(false)} disabled={completing}>
                <Text style={styles.completeClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.completeHint}>Ask the customer to sign below to confirm the work is complete. Leave blank to complete without a signature.</Text>
            <Text style={styles.signatureLabel}>Customer Signature</Text>
            <View style={styles.signatureBox}>
              <WebView
                originWhitelist={['*']}
                source={{ html: SIGNATURE_HTML }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                scrollEnabled={false}
                onMessage={e => finishComplete(e.nativeEvent.data)}
              />
            </View>
            {completing && (
              <View style={styles.completeBusy}>
                <ActivityIndicator color="#22c55e" />
                <Text style={styles.completeBusyText}>Completing…</Text>
              </View>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Status picker modal */}
      <Modal visible={showStatusPicker} transparent animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setShowStatusPicker(false)} activeOpacity={1}>
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>Update Status</Text>
            {otherStatuses.map(s => (
              <TouchableOpacity key={s.key} style={styles.pickerRow} onPress={() => updateStatus(s.key)}>
                <View style={[styles.dot, { backgroundColor: statusHex(s.color) }]} />
                <Text style={styles.pickerLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showKitPicker} transparent animationType="fade" onRequestClose={() => !addingKit && setShowKitPicker(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => !addingKit && setShowKitPicker(false)} activeOpacity={1}>
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>Add kit</Text>
            {kits.map(kit => (
              <View key={kit.id} style={styles.kitRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerLabel} numberOfLines={1}>{kit.name}</Text>
                  <Text style={styles.kitMeta}>{kit.kit_items.length} item{kit.kit_items.length === 1 ? '' : 's'}</Text>
                </View>
                <TouchableOpacity style={styles.kitBtn} disabled={addingKit} onPress={() => addKit(kit, 'bundle')}>
                  <Text style={styles.kitBtnText}>Bundle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.kitBtn, styles.kitBtnAlt]} disabled={addingKit} onPress={() => addKit(kit, 'split')}>
                  <Text style={[styles.kitBtnText, styles.kitBtnTextAlt]}>Split</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invoice sheet — full / deposit / progress claim */}
      <Modal visible={showInvoice} transparent animationType="fade" onRequestClose={() => !invoicing && setShowInvoice(false)}>
        <TouchableOpacity style={styles.overlay} onPress={() => !invoicing && setShowInvoice(false)} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.picker}>
            <Text style={styles.pickerTitle}>Invoice this job</Text>
            <View style={styles.invModeRow}>
              {([['full', 'Full'], ['actuals', 'Actuals'], ['deposit', 'Deposit'], ['progress', 'Progress']] as const).map(([mode, label]) => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.invModeBtn, invMode === mode && styles.invModeBtnActive]}
                  onPress={() => setInvMode(mode)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label} invoice`}
                >
                  <Text style={[styles.invModeText, invMode === mode && styles.invModeTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {invMode === 'full' && (
              <Text style={styles.invHint}>Bills the full quoted amount — or the remaining balance if you've already invoiced a deposit or progress claim.</Text>
            )}
            {invMode === 'actuals' && (
              <Text style={styles.invHint}>Bills exactly what's logged in Materials &amp; parts above — for jobs with no quote, or where you bill by actuals.</Text>
            )}
            {invMode === 'deposit' && (
              <>
                <Text style={styles.invHint}>Up-front payment before work starts.</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={styles.invUnitRow}>
                    {(['$', '%'] as const).map(u => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.invUnitBtn, invDepositUnit === u && styles.invModeBtnActive]}
                        onPress={() => setInvDepositUnit(u)}
                        accessibilityRole="button"
                        accessibilityLabel={u === '$' ? 'Fixed dollar deposit' : 'Percentage of quote deposit'}
                      >
                        <Text style={[styles.invModeText, invDepositUnit === u && styles.invModeTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.invInput, { flex: 1 }]}
                    value={invAmount}
                    onChangeText={setInvAmount}
                    placeholder={invDepositUnit === '$' ? 'Deposit amount' : '% of quoted total'}
                    placeholderTextColor="#6b7280"
                    keyboardType="decimal-pad"
                  />
                </View>
              </>
            )}
            {invMode === 'progress' && (
              <>
                <Text style={styles.invHint}>Bill a percentage of the quoted total as this stage completes.</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
                  {['25', '50', '75'].map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.invChip, invPct === p && styles.invModeBtnActive]}
                      onPress={() => setInvPct(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`${p} percent`}
                    >
                      <Text style={[styles.invModeText, invPct === p && styles.invModeTextActive]}>{p}%</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={[styles.invInput, { flex: 1 }]}
                    value={invPct}
                    onChangeText={setInvPct}
                    placeholder="%"
                    placeholderTextColor="#6b7280"
                    keyboardType="decimal-pad"
                  />
                </View>
              </>
            )}
            <TouchableOpacity
              style={[styles.invCreateBtn, invoicing && { opacity: 0.6 }]}
              onPress={() => createInvoice()}
              disabled={invoicing}
              accessibilityRole="button"
              accessibilityLabel="Create invoice"
            >
              {invoicing ? <ActivityIndicator color="#fff" /> : <Text style={styles.invCreateText}>Create invoice</Text>}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <TimeEntryEditModal
        entry={editingTimeEntry}
        jobs={pickerJobs ?? []}
        onClose={() => setEditingTimeEntry(null)}
        onSaved={() => { setEditingTimeEntry(null); refreshTimesheets?.() }}
      />

      {job && (
        <ScheduleVisitModal
          visible={showScheduleVisit}
          initialDate={new Date().toISOString().slice(0, 10)}
          presetJob={{ id: job.id, job_number: job.job_number, title: job.title }}
          onClose={() => setShowScheduleVisit(false)}
          onSaved={() => { setShowScheduleVisit(false); refreshVisits?.(); refreshJob?.() }}
        />
      )}

      {/* Fill form modal */}
      <Modal visible={!!fillTemplate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !savingForm && setFillTemplate(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={styles.formModalHeader}>
            <Text style={styles.completeTitle} numberOfLines={1}>{fillTemplate?.name}</Text>
            <TouchableOpacity onPress={() => setFillTemplate(null)} disabled={savingForm}>
              <Text style={styles.completeClose}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {(() => {
              let fields: FormField[] = []
              try { fields = fillTemplate ? JSON.parse(fillTemplate.fields || '[]') : [] } catch { fields = [] }
              return fields.map(f => (
                <View key={f.id}>
                  <Text style={styles.fieldLabel}>{f.label}{f.required ? ' *' : ''}</Text>
                  {f.type === 'checkbox' ? (
                    <TouchableOpacity
                      style={[styles.checkboxRow, fillAnswers[f.id] === 'yes' && styles.checkboxRowOn]}
                      onPress={() => setFillAnswers(a => ({ ...a, [f.id]: a[f.id] === 'yes' ? 'no' : 'yes' }))}
                    >
                      <Text style={styles.checkboxText}>{fillAnswers[f.id] === 'yes' ? '☑ Yes' : '☐ No'}</Text>
                    </TouchableOpacity>
                  ) : f.type === 'select' ? (
                    <View style={styles.chips}>
                      {(f.options ?? []).map(opt => (
                        <TouchableOpacity
                          key={opt}
                          style={[styles.selectChip, fillAnswers[f.id] === opt && styles.selectChipOn]}
                          onPress={() => setFillAnswers(a => ({ ...a, [f.id]: opt }))}
                        >
                          <Text style={[styles.selectChipText, fillAnswers[f.id] === opt && { color: '#fff' }]}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : f.type === 'signature' || f.type === 'photo' ? (
                    <Text style={styles.unsupportedField}>Not supported on mobile yet — fill this one from the web app.</Text>
                  ) : (
                    <TextInput
                      style={[styles.input, f.type === 'textarea' && { minHeight: 80, textAlignVertical: 'top' }]}
                      value={fillAnswers[f.id] ?? ''}
                      onChangeText={v => setFillAnswers(a => ({ ...a, [f.id]: v }))}
                      placeholder={f.type === 'date' ? 'YYYY-MM-DD' : ''}
                      keyboardType={f.type === 'number' ? 'numeric' : 'default'}
                      multiline={f.type === 'textarea'}
                    />
                  )}
                </View>
              ))
            })()}
          </ScrollView>
          <View style={{ padding: 16 }}>
            <TouchableOpacity style={[styles.completeBtn, savingForm && { opacity: 0.6 }]} onPress={saveForm} disabled={savingForm} activeOpacity={0.85}>
              {savingForm ? <ActivityIndicator color="#fff" /> : <Text style={styles.completeBtnText}>Save &amp; submit</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  stepperWrap: { marginBottom: 14 },
  step: { alignItems: 'center', width: 62, position: 'relative' },
  stepBar: { position: 'absolute', top: 12, left: -31, width: 62, height: 3, backgroundColor: colors.line, zIndex: 1 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center', marginBottom: 4, zIndex: 2 },
  stepDotText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  stepLabel: { fontSize: 9, color: colors.mut, textAlign: 'center' },
  quickWrap: { marginBottom: 14 },
  qbtn: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', gap: 5, minWidth: 70 },
  qbtnHot: { backgroundColor: colors.brandBg, borderColor: colors.brandBorder },
  qbtnIcon: { fontSize: 19 },
  qbtnLabel: { fontSize: 11.5, fontWeight: '700', color: colors.ink },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  formRowIcon: { fontSize: 16 },
  formRowLabel: { flex: 1, fontSize: 13.5, color: colors.ink },
  formStatus: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  formStatusTodo: { backgroundColor: colors.brandBg },
  formStatusDone: { backgroundColor: colors.successBg },
  formStatusText: { fontSize: 11, fontWeight: '700' },
  formModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: colors.sub, marginBottom: 6 },
  checkboxRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 13 },
  checkboxRowOn: { backgroundColor: colors.successBg, borderColor: colors.success },
  checkboxText: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  selectChip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  selectChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  selectChipText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  unsupportedField: { fontSize: 12, color: colors.mut, fontStyle: 'italic' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.ink },
  container: { flex: 1, backgroundColor: '#f9fafb' },
  headerCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  jobNumber: { fontSize: 12, color: '#6b7280', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statusBadge: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', minWidth: 80, alignItems: 'center' },
  statusText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 14, color: '#6b7280', lineHeight: 20, marginBottom: 12 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  metaLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  metaValue: { fontSize: 13, color: '#374151', fontWeight: '500', flex: 1, textAlign: 'right' },
  metaLink: { color: '#f97316', textDecorationLine: 'underline' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  addLink: { fontSize: 14, color: '#f97316', fontWeight: '600' },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  visitText: { flex: 1, fontSize: 14, color: '#374151' },
  minibadge: { borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  minibadgeText: { fontSize: 11, fontWeight: '600' },
  materialAddBox: { backgroundColor: colors.brandBg, borderWidth: 1, borderColor: colors.brandBorder, borderRadius: radius.md, padding: 12, marginBottom: 10 },
  materialInputsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  materialSmallInput: { flex: 0.8 },
  materialActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  materialRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f9fafb', gap: 8 },
  materialDesc: { flex: 1, fontSize: 14, color: '#374151' },
  materialQty: { fontSize: 13, color: '#6b7280', minWidth: 40, textAlign: 'right' },
  materialPrice: { fontSize: 14, fontWeight: '600', color: '#111827', minWidth: 64, textAlign: 'right' },
  materialTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  materialTotalLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  materialTotalValue: { fontSize: 14, fontWeight: '700', color: '#111827' },
  addNoteBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  noteInput: { fontSize: 15, color: '#111827', minHeight: 80, textAlignVertical: 'top' },
  addNoteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelText: { fontSize: 15, color: '#6b7280', paddingVertical: 4 },
  saveNoteBtn: { backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6 },
  saveNoteBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  noteCard: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f9fafb' },
  noteBody: { fontSize: 14, color: '#374151', lineHeight: 20 },
  noteMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  emptyText: { color: '#d1d5db', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  bottomBar: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  bigTimerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, borderRadius: 16, paddingVertical: 18 },
  bigTimerBtnStart: { backgroundColor: '#22c55e' },
  bigTimerBtnStop: { backgroundColor: '#ef4444' },
  bigTimerIcon: { fontSize: 28, color: '#fff' },
  bigTimerLabel: { fontSize: 20, fontWeight: '800', color: '#fff' },
  bigTimerElapsed: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  photoThumb: { borderRadius: 8, overflow: 'hidden' },
  photoImg: { width: 90, height: 90, borderRadius: 8 },
  completeBtn: { marginTop: 14, backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  completeOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  completeSheet: { backgroundColor: '#f9fafb', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, height: '82%' },
  completeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 4 },
  signoffLogo: { width: 150, height: 38, marginBottom: 4 },
  signoffCompany: { fontSize: 12, fontWeight: '800', color: colors.brandDark, marginBottom: 3 },
  completeTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  completeClose: { fontSize: 15, color: '#6b7280', fontWeight: '600' },
  completeHint: { fontSize: 13, color: '#6b7280', lineHeight: 18, marginBottom: 12 },
  signatureLabel: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  signatureBox: { flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', marginBottom: 12 },
  completeBusy: { position: 'absolute', left: 0, right: 0, bottom: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  completeBusyText: { color: '#22c55e', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
  picker: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 14 },
  invModeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  invModeBtn: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fff' },
  invModeBtnActive: { borderColor: '#f97316', backgroundColor: '#fff7ed' },
  invModeText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
  invModeTextActive: { color: '#c2410c' },
  invHint: { fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 18 },
  invUnitRow: { flexDirection: 'row', gap: 6 },
  invUnitBtn: { width: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  invChip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  invInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#111827', backgroundColor: '#fff' },
  invCreateBtn: { backgroundColor: '#f97316', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 14 },
  invCreateText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  pickerLabel: { fontSize: 16, color: '#374151' },
  kitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  kitMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  kitBtn: { backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  kitBtnAlt: { backgroundColor: '#f3f4f6' },
  kitBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  kitBtnTextAlt: { color: '#374151' },
})
