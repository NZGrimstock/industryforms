'use client'

import { Button } from '@/components/ui/button'
import { Printer } from 'lucide-react'

export function PrintReportsButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print-hidden">
      <Printer className="h-4 w-4" /> Print
    </Button>
  )
}
