'use client'
import { useState } from 'react'
import { Printer, FileDown } from 'lucide-react'
import type { JobSheetData } from './job-sheet-pdf'
import { DropdownItem } from '@/components/ui/dropdown'

interface Props {
  data: JobSheetData
  asMenuItems?: boolean
}

export function PrintJobSheet({ data, asMenuItems }: Props) {
  const [printing, setPrinting] = useState(false)

  async function handlePrint() {
    setPrinting(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { JobSheetPdf } = await import('./job-sheet-pdf')
      const blob = await pdf(<JobSheetPdf data={data} />).toBlob()
      const url = URL.createObjectURL(blob)
      const w = window.open(url, '_blank')
      if (w) w.addEventListener('load', () => w.print(), { once: true })
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (e) {
      console.error(e)
    } finally {
      setPrinting(false)
    }
  }

  async function handleDownload() {
    setPrinting(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { JobSheetPdf } = await import('./job-sheet-pdf')
      const blob = await pdf(<JobSheetPdf data={data} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `job-sheet-${data.job.job_number}.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      console.error(e)
    } finally {
      setPrinting(false)
    }
  }

  if (asMenuItems) {
    return (
      <>
        <DropdownItem icon={<Printer />} disabled={printing} onClick={handlePrint}>Print job</DropdownItem>
        <DropdownItem icon={<FileDown />} disabled={printing} onClick={handleDownload}>Create PDF</DropdownItem>
      </>
    )
  }

  return (
    <div className="flex gap-1.5">
      <button
        onClick={handlePrint}
        disabled={printing}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50"
      >
        <Printer className="h-3.5 w-3.5" />
        {printing ? 'Preparing…' : 'Print sheet'}
      </button>
      <button
        onClick={handleDownload}
        disabled={printing}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 disabled:opacity-50"
      >
        <FileDown className="h-3.5 w-3.5" />
        PDF
      </button>
    </div>
  )
}
