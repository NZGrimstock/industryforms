import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function PrevNextNav({ prevHref, nextHref }: { prevHref: string | null; nextHref: string | null }) {
  const base = 'p-1.5 rounded-lg border transition-colors'
  const active = 'border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300'
  const disabled = 'border-gray-100 text-gray-200 pointer-events-none'
  return (
    <div className="flex items-center gap-1">
      {prevHref ? (
        <Link href={prevHref} className={`${base} ${active}`} title="Previous" aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span className={`${base} ${disabled}`} aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>
      )}
      {nextHref ? (
        <Link href={nextHref} className={`${base} ${active}`} title="Next" aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className={`${base} ${disabled}`} aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
      )}
    </div>
  )
}
