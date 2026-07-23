'use client'
import { useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import type { InvoicePdfData } from './invoice-pdf'
import { DropdownItem } from '@/components/ui/dropdown'

async function makeInvoiceBlob(data: InvoicePdfData) {
  const { pdf } = await import('@react-pdf/renderer')
  const { InvoicePdf } = await import('./invoice-pdf')
  return pdf(<InvoicePdf data={data} />).toBlob()
}

// Opens the rendered PDF in a new tab for viewing (no auto-print, no download
// prompt) — used by "Complete and PDF" so the tradie sees exactly what was sent.
export async function viewInvoicePdf(data: InvoicePdfData) {
  const blob = await makeInvoiceBlob(data)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function PrintInvoice({ data, asMenuItems }: { data: InvoicePdfData; asMenuItems?: boolean }) {
  const [busy, setBusy] = useState(false)

  async function makeBlob() {
    return makeInvoiceBlob(data)
  }

  async function print() {
    setBusy(true)
    try {
      const blob = await makeBlob()
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
      const blob = await makeBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.invoice.invoice_number}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } finally {
      setBusy(false)
    }
  }

  if (asMenuItems) {
    return (
      <>
        <DropdownItem icon={<Printer />} disabled={busy} onClick={print}>Print invoice</DropdownItem>
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
