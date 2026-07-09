/**
 * lib/compliance/generate.ts
 * Server-side PDF generation for compliance documents.
 * Must run in Node.js runtime (not Edge).
 */
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { setRenderCouncil, setRenderTimezone } from './templates/BaseTemplate'
import { DEFAULT_TIMEZONE } from '@/lib/datetime'
import { PS1DesignTemplate } from './templates/PS1DesignTemplate'
import { PS2DesignReviewTemplate } from './templates/PS2DesignReviewTemplate'
import { PS3GeneralConstructionTemplate } from './templates/PS3GeneralConstructionTemplate'
import { PS3DrainageTemplate } from './templates/PS3DrainageTemplate'
import { PS3PlumbingTemplate } from './templates/PS3PlumbingTemplate'
import { PS4ConstructionReviewTemplate } from './templates/PS4ConstructionReviewTemplate'
import { Form2ATemplate, Form6ATemplate } from './templates/RBWTemplates'

export type DocType =
  | 'PS1'
  | 'PS2'
  | 'PS3_GENERAL'
  | 'PS3_DRAINAGE'
  | 'PS3_PLUMBING'
  | 'PS4'
  | 'RBW_2A'
  | 'RBW_6A'

export interface GenerateDocInput {
  docType: DocType
  docNumber: string
  statementData: Record<string, unknown>
  profile: {
    full_name?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    lbp_number?: string | null
    cpeng_number?: string | null
    signature_base64?: string | null
    council?: string | null
    company_name?: string | null
    logo_url?: string | null
    timezone?: string | null
  }
}

export async function generateComplianceDoc(input: GenerateDocInput): Promise<Buffer> {
  const { docType, docNumber, statementData, profile } = input

  // Set council + timezone for footer/date fallback rendering
  setRenderCouncil(profile.council || 'auckland')
  setRenderTimezone(profile.timezone || DEFAULT_TIMEZONE)

  const statement = {
    doc_number: docNumber,
    ps_number: docNumber,
    statement_data: statementData,
  }

  // Profile shape expected by templates
  const templateProfile = {
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
    lbp_number: profile.lbp_number,
    cpeng_number: profile.cpeng_number,
    council: profile.council || 'auckland',
    company_name: profile.company_name,
    // registration_number is the legacy field — map lbp_number to it for base templates
    registration_number: profile.lbp_number || profile.cpeng_number,
  }

  const signature = profile.signature_base64 || null

  let element: React.ReactElement

  switch (docType) {
    case 'PS1':
      element = React.createElement(PS1DesignTemplate, { statement, profile: templateProfile, signature })
      break
    case 'PS2':
      element = React.createElement(PS2DesignReviewTemplate, { statement, profile: templateProfile, signature })
      break
    case 'PS3_GENERAL':
      element = React.createElement(PS3GeneralConstructionTemplate, { statement, profile: templateProfile, signature })
      break
    case 'PS3_DRAINAGE':
      element = React.createElement(PS3DrainageTemplate, { statement, profile: templateProfile, signature })
      break
    case 'PS3_PLUMBING':
      element = React.createElement(PS3PlumbingTemplate, { statement, profile: templateProfile, signature })
      break
    case 'PS4':
      element = React.createElement(PS4ConstructionReviewTemplate, { statement, profile: templateProfile, signature })
      break
    case 'RBW_2A':
      element = React.createElement(Form2ATemplate, { statement, profile: templateProfile, signature })
      break
    case 'RBW_6A':
      element = React.createElement(Form6ATemplate, { statement, profile: templateProfile, signature })
      break
    default:
      throw new Error(`Unknown document type: ${docType}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any)
  return Buffer.from(buffer)
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  PS1: 'PS1 — Producer Statement Design',
  PS2: 'PS2 — Producer Statement Design Review',
  PS3_GENERAL: 'PS3 — General Construction',
  PS3_DRAINAGE: 'PS3 — Drainage',
  PS3_PLUMBING: 'PS3 — Plumbing',
  PS4: 'PS4 — Construction Review',
  RBW_2A: 'RBW Form 2A — Certificate of Design Work',
  RBW_6A: 'RBW Form 6A — Record of Building Work',
}

export const DOC_TYPE_FORM_CODES: Record<DocType, string> = {
  PS1: 'AC2304',
  PS2: 'AC2305',
  PS3_GENERAL: 'AC2310',
  PS3_DRAINAGE: 'AC2306',
  PS3_PLUMBING: 'AC2311',
  PS4: 'AC2315',
  RBW_2A: 'Form 2A',
  RBW_6A: 'Form 6A',
}
