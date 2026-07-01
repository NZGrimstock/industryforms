'use client'
import { useState } from 'react'
import { FileDown, Printer } from 'lucide-react'
import type { InvoicePdfData } from './invoice-pdf'

export function PrintInvoice({ data }: { data: InvoicePdfData }) {
  const [busy, setBusy] = useState(false)

  async function makeBlob() {
    const { pdf } = await import('@react-pdf/renderer')
    const { InvoicePdf } = await import('./invoice-pdf')
    return pdf(<InvoicePdf data={data} />).toBlob()
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
