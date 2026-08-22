'use client'
import { useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import type { QuotePdfData } from './quote-pdf'
import { DropdownItem } from '@/components/ui/dropdown'

async function makeQuoteBlob(data: QuotePdfData) {
  const { pdf } = await import('@react-pdf/renderer')
  const { QuotePdf } = await import('./quote-pdf')
  return pdf(<QuotePdf data={data} />).toBlob()
}

// Opens the rendered PDF in a new tab for viewing (no auto-print, no download
// prompt) — mirrors viewInvoicePdf.
export async function viewQuotePdf(data: QuotePdfData) {
  const blob = await makeQuoteBlob(data)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function PrintQuote({ data, asMenuItems }: { data: QuotePdfData; asMenuItems?: boolean }) {
  const [busy, setBusy] = useState(false)

  async function print() {
    setBusy(true)
    try {
      const blob = await makeQuoteBlob(data)
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (w) w.addEventListener('load', () => w.print(), { once: true })
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } finally {
      setBusy(false)
    }
  }

  async function download() {
    setBusy(true)
    try {
      const blob = await makeQuoteBlob(data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.quote.quote_number}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      setBusy(false)
    }
  }

  if (asMenuItems) {
    return (
      <>
        <DropdownItem icon={<Printer />} disabled={busy} onClick={print}>Print</DropdownItem>
        <DropdownItem icon={<FileDown />} disabled={busy} onClick={download}>Create PDF</DropdownItem>
      </>
    )
  }

  return (
    <>
      <button onClick={print} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50">
        <Printer className="h-4 w-4" /> {busy ? 'Preparing...' : 'Print'}
      </button>
      <button onClick={download} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50">
        <FileDown className="h-4 w-4" /> PDF
      </button>
    </>
  )
}
