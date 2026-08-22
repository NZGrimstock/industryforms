'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ComplianceDocModal } from './ComplianceDocModal'
import { formatDate } from '@/lib/utils'
import { FileText, Download, ShieldCheck } from 'lucide-react'

interface ComplianceDoc {
  id: string
  doc_number: string
  doc_type: string
  ac_form_code: string | null
  project_address: string | null
  status: string
  created_at: string
  pdf_path: string | null
}

interface ComplianceDocsProps {
  jobId: string
  companyId: string
  profileId: string
  projectAddress?: string | null
  profileHasSignature: boolean
  initialDocs: ComplianceDoc[]
  pdfSignedUrls: Record<string, string>
}

const DOC_TYPE_LABELS: Record<string, string> = {
  PS1: 'PS1 Design',
  PS2: 'PS2 Design Review',
  PS3_GENERAL: 'PS3 General Construction',
  PS3_DRAINAGE: 'PS3 Drainage',
  PS3_PLUMBING: 'PS3 Plumbing',
  PS4: 'PS4 Construction Review',
  RBW_2A: 'RBW Form 2A',
  RBW_6A: 'RBW Form 6A',
}

export function ComplianceDocs({
  jobId,
  projectAddress,
  profileHasSignature,
  initialDocs,
  pdfSignedUrls,
}: ComplianceDocsProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [docs, setDocs] = useState<ComplianceDoc[]>(initialDocs)

  return (
    <>
      <div className="flex items-center justify-between mb-0">
        <div />
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5"
        >
          <ShieldCheck className="h-4 w-4" />
          New compliance doc
        </Button>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 px-6 py-4">No compliance documents yet</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {docs.map(doc => (
            <li key={doc.id} className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-blue-700 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {doc.doc_number}
                    {doc.ac_form_code && <span className="text-gray-400 font-normal ml-1.5">({doc.ac_form_code})</span>}
                  </p>
                  <p className="text-xs text-gray-500">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</p>
                  {doc.project_address && <p className="text-xs text-gray-400 mt-0.5">{doc.project_address}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-400">{formatDate(doc.created_at)}</span>
                {pdfSignedUrls[doc.id] && (
                  <a
                    href={pdfSignedUrls[doc.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 font-medium"
                  >
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ComplianceDocModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        jobId={jobId}
        prefillAddress={projectAddress || ''}
        profileHasSignature={profileHasSignature}
        onSuccess={(docNumber) => {
          // Optimistically add the new doc to the list (full data will be available on refresh)
          setDocs(prev => [{
            id: crypto.randomUUID(),
            doc_number: docNumber,
            doc_type: 'unknown',
            ac_form_code: null,
            project_address: projectAddress || null,
            status: 'completed',
            created_at: new Date().toISOString(),
            pdf_path: null,
          }, ...prev])
          setModalOpen(false)
        }}
      />
    </>
  )
}
