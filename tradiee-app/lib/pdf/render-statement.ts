// Shared react-pdf renderer for statements — used by both the print route
// (app/api/statements/[customerId]/pdf) and the email route (which attaches
// the same PDF), so the two never drift apart. Node-only (react-pdf).
import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { StatementPdf, type StatementPdfData } from '@/components/pdf/statement-pdf'

export async function renderStatementPdfBuffer(data: StatementPdfData): Promise<Buffer> {
  const element = React.createElement(StatementPdf, { data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Buffer.from(await renderToBuffer(element as any))
}
