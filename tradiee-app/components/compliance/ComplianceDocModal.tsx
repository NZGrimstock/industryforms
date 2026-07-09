'use client'
import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { FileText, CheckCircle, Download } from 'lucide-react'
import { useTimezone } from '@/components/providers/timezone-provider'
import { formatDate } from '@/lib/datetime'

type DocType = 'PS1' | 'PS2' | 'PS3_GENERAL' | 'PS3_DRAINAGE' | 'PS3_PLUMBING' | 'PS4' | 'RBW_2A' | 'RBW_6A'

const DOC_TYPES: { value: DocType; label: string; description: string }[] = [
  { value: 'PS1', label: 'PS1 — Producer Statement Design', description: 'For design professionals providing design compliance assurance' },
  { value: 'PS2', label: 'PS2 — Producer Statement Design Review', description: 'For design professionals reviewing another\'s design' },
  { value: 'PS3_GENERAL', label: 'PS3 — General Construction (AC2310)', description: 'For builders/tradespeople confirming construction compliance' },
  { value: 'PS3_DRAINAGE', label: 'PS3 — Drainage (AC2306)', description: 'For certified drainlayers confirming drainage work' },
  { value: 'PS3_PLUMBING', label: 'PS3 — Plumbing (AC2311)', description: 'For certifying plumbers confirming plumbing work' },
  { value: 'PS4', label: 'PS4 — Construction Review (AC2315)', description: 'For engineers/designers who observed construction' },
  { value: 'RBW_2A', label: 'RBW Form 2A — Certificate of Design Work', description: 'Memorandum from LBP — certificate of design work (s30C/45)' },
  { value: 'RBW_6A', label: 'RBW Form 6A — Record of Building Work', description: 'Memorandum from LBP — record of building work (s88)' },
]

// Fields shown per doc type
const NZBC_CLAUSES = ['B1','B2','C1','C2','C3','C4','C5','C6','D1','D2','E1','E2','E3','F1','F2','F3','F4','F5','F6','F7','F8','F9','G1','G2','G3','G4','G5','G6','G7','G8','G9','G10','G11','G12','G13','G14','G15','H1']

interface ComplianceDocModalProps {
  open: boolean
  onClose: () => void
  jobId?: string
  prefillAddress?: string
  profileHasSignature: boolean
  onSuccess?: (docNumber: string, pdfUrl: string) => void
}

export function ComplianceDocModal({
  open,
  onClose,
  jobId,
  prefillAddress = '',
  profileHasSignature,
  onSuccess,
}: ComplianceDocModalProps) {
  const { toast } = useToast()
  const timezone = useTimezone()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ docNumber: string; pdfUrl: string | null } | null>(null)

  // Step 1 state
  const [docType, setDocType] = useState<DocType>('PS3_GENERAL')

  // Step 2 fields
  const [form, setForm] = useState({
    projectAddress: prefillAddress,
    bcReference: '',
    descriptionOfWork: '',
    legalDescription: '',
    clientName: '',
    clientEmail: '',
    territorialAuthority: '',
    // PS1/PS2 extra
    engagedBy: '',
    drawingTitle: '',
    complianceMethod: 'MBIE' as 'MBIE' | 'alternative',
    designServiceScope: 'all' as 'part' | 'all',
    // NZBC clauses
    nzbcClauses: [] as string[],
    // Drainage / Plumbing test method
    testMethod: '',
    // RBW work items (simplified: just store descriptions as text for generation)
    primaryStructureWork: '',
    moistureWork: '',
  })

  function setF(k: keyof typeof form, v: unknown) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function toggleClause(c: string) {
    setForm(f => ({
      ...f,
      nzbcClauses: f.nzbcClauses.includes(c)
        ? f.nzbcClauses.filter(x => x !== c)
        : [...f.nzbcClauses, c],
    }))
  }

  function buildStatementData(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      siteAddress: form.projectAddress,
      buildingConsentNo: form.bcReference,
      descriptionOfWork: form.descriptionOfWork,
      legalDescription: form.legalDescription,
      ownerName: form.clientName,
      ownerEmail: form.clientEmail,
      clientName: form.clientName,
      clientEmail: form.clientEmail,
      nzbcClauses: form.nzbcClauses,
      date: formatDate(new Date(), timezone),
    }

    if (docType === 'PS1' || docType === 'PS2') {
      base.engagedBy = form.engagedBy
      base.drawingTitle = form.drawingTitle
      base.drawings = form.drawingTitle
      base.complianceMethod = form.complianceMethod
      base.compliancePath = form.complianceMethod
      base.designServiceScope = form.designServiceScope
      base.reviewScope = form.designServiceScope
      base.workDescription = form.descriptionOfWork
      base.reviewWorkDescription = form.descriptionOfWork
    }

    if (docType === 'PS3_DRAINAGE' || docType === 'PS3_PLUMBING') {
      base.testMethod = form.testMethod
    }

    if (docType === 'RBW_2A' || docType === 'RBW_6A') {
      base.streetAddress = form.projectAddress
      base.consentNumber = form.bcReference
      base.ownerMailingAddress = ''
      base.ownerPhone = ''
      // Simple work items: mark primary structure as checked with description text
      const primaryItems: Record<string, unknown> = {}
      if (form.primaryStructureWork) {
        primaryItems['walls'] = { checked: true, description: form.primaryStructureWork, carryout: 'carried out' }
      }
      base.workItems = primaryItems
      base.declarationChoice = 'a'
    }

    return base
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const res = await fetch('/api/compliance/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType,
          jobId: jobId || undefined,
          bcReference: form.bcReference || undefined,
          clientName: form.clientName || undefined,
          clientEmail: form.clientEmail || undefined,
          projectAddress: form.projectAddress || undefined,
          territorialAuthority: form.territorialAuthority || undefined,
          statementData: buildStatementData(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast(data.error ?? 'Failed to generate document', 'error')
        setLoading(false)
        return
      }
      setResult({ docNumber: data.docNumber, pdfUrl: data.pdfUrl })
      setStep(3)
      onSuccess?.(data.docNumber, data.pdfUrl)
    } catch (err) {
      toast(String(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setStep(1)
    setResult(null)
    setForm({
      projectAddress: prefillAddress,
      bcReference: '',
      descriptionOfWork: '',
      legalDescription: '',
      clientName: '',
      clientEmail: '',
      territorialAuthority: '',
      engagedBy: '',
      drawingTitle: '',
      complianceMethod: 'MBIE',
      designServiceScope: 'all',
      nzbcClauses: [],
      testMethod: '',
      primaryStructureWork: '',
      moistureWork: '',
    })
    onClose()
  }

  const showNzbc = ['PS1', 'PS2', 'PS3_GENERAL', 'PS4'].includes(docType)
  const showDesignFields = ['PS1', 'PS2'].includes(docType)
  const showTestMethod = ['PS3_DRAINAGE', 'PS3_PLUMBING'].includes(docType)
  const showRBWFields = ['RBW_2A', 'RBW_6A'].includes(docType)

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="New compliance document"
      className="max-w-2xl"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              step === s ? 'bg-blue-700 text-white' :
              step > s ? 'bg-green-600 text-white' :
              'bg-gray-100 text-gray-400'
            }`}>
              {step > s ? '✓' : s}
            </div>
            {s < 3 && <div className={`h-0.5 w-8 ${step > s ? 'bg-green-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
        <span className="ml-2 text-sm text-gray-500">
          {step === 1 ? 'Select type' : step === 2 ? 'Document details' : 'Done'}
        </span>
      </div>

      {/* STEP 1: Select document type */}
      {step === 1 && (
        <div className="space-y-3">
          {DOC_TYPES.map(dt => (
            <label key={dt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${docType === dt.value ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <input
                type="radio"
                name="docType"
                value={dt.value}
                checked={docType === dt.value}
                onChange={() => setDocType(dt.value)}
                className="mt-1 accent-blue-700"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{dt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{dt.description}</p>
              </div>
            </label>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(2)}>Next: Document details →</Button>
          </div>
        </div>
      )}

      {/* STEP 2: Form fields */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800 mb-2">
            <FileText className="h-4 w-4 shrink-0" />
            {DOC_TYPES.find(d => d.value === docType)?.label}
          </div>

          {/* Core fields */}
          <div>
            <Label>Site / project address</Label>
            <Input value={form.projectAddress} onChange={e => setF('projectAddress', e.target.value)} placeholder="123 Example Street, Auckland" />
          </div>

          <div>
            <Label>Building consent number (BC reference)</Label>
            <Input value={form.bcReference} onChange={e => setF('bcReference', e.target.value)} placeholder="BC2024-001234" />
          </div>

          {!showRBWFields && (
            <div>
              <Label>Description of work</Label>
              <Textarea
                value={form.descriptionOfWork}
                onChange={e => setF('descriptionOfWork', e.target.value)}
                rows={3}
                placeholder="Describe the building work covered by this statement..."
              />
            </div>
          )}

          <div>
            <Label>Legal description (optional)</Label>
            <Input value={form.legalDescription} onChange={e => setF('legalDescription', e.target.value)} placeholder="Lot 1 DP 123456" />
          </div>

          {/* PS1/PS2 extra fields */}
          {showDesignFields && (
            <>
              <div>
                <Label>Engaged by</Label>
                <Input value={form.engagedBy} onChange={e => setF('engagedBy', e.target.value)} placeholder="Owner or developer name" />
              </div>
              <div>
                <Label>Drawing reference</Label>
                <Input value={form.drawingTitle} onChange={e => setF('drawingTitle', e.target.value)} placeholder="Drawing sheet number or title" />
              </div>
              <div>
                <Label>Compliance method</Label>
                <Select
                  value={form.complianceMethod}
                  onChange={e => setF('complianceMethod', e.target.value)}
                  options={[
                    { value: 'MBIE', label: 'MBIE Acceptable Solution / Verification Method' },
                    { value: 'alternative', label: 'Alternative Solution' },
                  ]}
                />
              </div>
              <div>
                <Label>Design scope</Label>
                <Select
                  value={form.designServiceScope}
                  onChange={e => setF('designServiceScope', e.target.value)}
                  options={[
                    { value: 'all', label: 'All building work' },
                    { value: 'part', label: 'Part of building work' },
                  ]}
                />
              </div>
            </>
          )}

          {/* Drainage/Plumbing test method */}
          {showTestMethod && (
            <div>
              <Label>Test method used</Label>
              {docType === 'PS3_DRAINAGE' ? (
                <Select
                  value={form.testMethod}
                  onChange={e => setF('testMethod', e.target.value)}
                  options={[
                    { value: '', label: '— Select test method —' },
                    { value: 'E1_water', label: 'NZBC E1: water test (clause 8.1)' },
                    { value: 'E1_air', label: 'NZBC E1: air test (clause 8.2/8.3)' },
                    { value: 'AS_water', label: 'AS/NZS 3500.2: water test (clause 15.2)' },
                    { value: 'AS_air', label: 'AS/NZS 3500.2: air pressure test (clause 15.3)' },
                    { value: 'pvc', label: 'AS/NZS 2032: PVC pipe (clause 7.3)' },
                  ]}
                />
              ) : (
                <Select
                  value={form.testMethod}
                  onChange={e => setF('testMethod', e.target.value)}
                  options={[
                    { value: '', label: '— Select test method —' },
                    { value: 'pressure_1500', label: '1500kPa 15 min — NZBC G12/AS1 clause 7.5.1' },
                    { value: 'AS3500_4', label: 'AS/NZS 3500.4: heated water (clause 11.3)' },
                    { value: 'AS3500_5', label: 'AS/NZS 3500.5: housing (clause 2.23.1)' },
                    { value: 'NZS7643', label: 'NZS 7643 clause 9.3.2' },
                  ]}
                />
              )}
            </div>
          )}

          {/* NZBC clauses */}
          {showNzbc && (
            <div>
              <Label>NZBC clauses (select all that apply)</Label>
              <p className="text-xs text-gray-400 mb-2">All statements must include B2</p>
              <div className="flex flex-wrap gap-1.5">
                {NZBC_CLAUSES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleClause(c)}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      form.nzbcClauses.includes(c)
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'border-gray-300 text-gray-600 hover:border-blue-400'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RBW specific */}
          {showRBWFields && (
            <>
              <div>
                <Label>Primary structure work description</Label>
                <Textarea
                  value={form.primaryStructureWork}
                  onChange={e => setF('primaryStructureWork', e.target.value)}
                  rows={3}
                  placeholder="Describe the primary structure restricted building work carried out or supervised..."
                />
              </div>
              <div>
                <Label>External moisture work description (optional)</Label>
                <Textarea
                  value={form.moistureWork}
                  onChange={e => setF('moistureWork', e.target.value)}
                  rows={2}
                  placeholder="Describe any external moisture management work..."
                />
              </div>
            </>
          )}

          {/* Client details */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-3">Client / owner details (for emailing)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Client name</Label>
                <Input value={form.clientName} onChange={e => setF('clientName', e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <Label>Client email</Label>
                <Input type="email" value={form.clientEmail} onChange={e => setF('clientEmail', e.target.value)} placeholder="client@example.com" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
            <Button onClick={() => setStep(3)}>Next: Review →</Button>
          </div>
        </div>
      )}

      {/* STEP 3: Review + sign + submit (or success) */}
      {step === 3 && !result && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-lg text-sm space-y-2">
            <p className="font-medium text-gray-900">{DOC_TYPES.find(d => d.value === docType)?.label}</p>
            {form.projectAddress && <p className="text-gray-600"><span className="text-gray-400">Address:</span> {form.projectAddress}</p>}
            {form.bcReference && <p className="text-gray-600"><span className="text-gray-400">BC Ref:</span> {form.bcReference}</p>}
            {form.clientName && <p className="text-gray-600"><span className="text-gray-400">Client:</span> {form.clientName}</p>}
            {form.nzbcClauses.length > 0 && (
              <p className="text-gray-600"><span className="text-gray-400">NZBC clauses:</span> {form.nzbcClauses.join(', ')}</p>
            )}
          </div>

          {/* Signature status */}
          <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${profileHasSignature ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            {profileHasSignature ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                <span className="text-green-800">Your stored signature will be applied to this document.</span>
              </>
            ) : (
              <>
                <span className="text-amber-700">No signature on file. The document will be generated with a blank signature line. <a href="/settings" className="underline font-medium">Add your signature in Profile settings</a> to have it auto-applied.</span>
              </>
            )}
          </div>

          <p className="text-xs text-gray-500">
            The PDF will be saved to this job and emailed to you{form.clientEmail ? ` and ${form.clientEmail}` : ''}.
          </p>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>← Back</Button>
            <Button onClick={handleSubmit} loading={loading}>
              Generate &amp; send document
            </Button>
          </div>
        </div>
      )}

      {/* Success state */}
      {step === 3 && result && (
        <div className="text-center py-6 space-y-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900">Document generated!</p>
            <p className="text-gray-500 text-sm mt-1">Document number: <strong>{result.docNumber}</strong></p>
            <p className="text-gray-400 text-xs mt-1">Emailed to you{form.clientEmail ? ` and ${form.clientEmail}` : ''}</p>
          </div>
          <div className="flex gap-3 justify-center">
            {result.pdfUrl && (
              <a
                href={result.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition-colors"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
            )}
            <Button variant="outline" onClick={handleClose}>Close</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
