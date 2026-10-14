// Paper-style document layout kit — quote, invoice, PO and job-sheet screens.
//
// The white page is exactly what the customer / supplier receives (it mirrors
// components/pdf/*-pdf.tsx). Anything internal lives in <InternalRail>, beside
// the page, never on it. See SPRINT_PAPER_DOCUMENTS.md.
//
// Server-safe: no hooks, no 'use client', so server pages render it directly
// and client editors (quote-builder, invoice-paper-lines, …) import it too.
import type { ReactNode } from 'react'
import { EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The printed documents are Helvetica; the page on screen matches. */
export const PAPER_FONT = "font-['Helvetica_Neue',Helvetica,Arial,sans-serif]"

/** Borderless field that reads as printed text, tinted on hover/focus. */
export const PAPER_INPUT =
  'w-full min-w-0 rounded-[3px] border-0 bg-transparent px-1 py-1 text-inherit [font:inherit] placeholder:text-gray-400 ' +
  'hover:bg-orange-50 hover:shadow-[inset_0_-1px_0_#fdba74] focus:bg-orange-50 focus:shadow-[inset_0_0_0_1.5px_#f97316] focus:outline-none ' +
  'read-only:cursor-default read-only:hover:bg-transparent read-only:hover:shadow-none disabled:hover:bg-transparent disabled:hover:shadow-none'

/** # | Description | Qty | Unit price | Total — shared by every line table. */
export const PAPER_LINE_GRID = 'grid grid-cols-[28px_minmax(0,1fr)_120px_110px_110px] items-center gap-x-1.5'

export type PaperCompany = {
  name: string
  email?: string | null
  phone?: string | null
  gst_number?: string | null
  logo_url?: string | null
}

export function DocumentWorkspace({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-start gap-6', className)}>{children}</div>
}

export function Paper({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <article
      aria-label={label}
      className={cn(
        'relative min-w-0 max-w-[860px] flex-[999_1_640px] bg-white px-5 py-7 text-[13px] text-gray-900 ring-1 ring-black/5 sm:px-12 sm:py-12',
        'shadow-[0_1px_2px_rgba(0,0,0,.06),0_12px_32px_rgba(17,24,39,.10)]',
        PAPER_FONT,
        className,
      )}
    >
      {children}
    </article>
  )
}

export function PaperHeader({ company, docLabel, docNumber, compact }: { company: PaperCompany; docLabel: string; docNumber: string; compact?: boolean }) {
  return (
    <div className="mb-5 flex flex-col gap-4 border-b-2 border-orange-500 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {company.logo_url && !compact ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo_url} alt={company.name} className="mb-2 h-12 w-auto max-w-[160px] object-contain" />
        ) : null}
        <div className={cn('font-bold', compact ? 'text-[17px]' : 'text-xl')}>{company.name}</div>
        {compact ? (
          <div className="mt-0.5 text-[11.5px] text-gray-600">{[company.phone, company.email].filter(Boolean).join(' · ')}</div>
        ) : (
          <>
            {company.email ? <div className="mt-0.5 text-[11.5px] text-gray-600">{company.email}</div> : null}
            {company.phone ? <div className="mt-0.5 text-[11.5px] text-gray-600">{company.phone}</div> : null}
            {company.gst_number ? <div className="mt-0.5 text-[11.5px] text-gray-600">GST {company.gst_number}</div> : null}
          </>
        )}
      </div>
      <div className="sm:text-right">
        <div className="text-[10px] font-bold uppercase tracking-[.06em] text-gray-600">{docLabel}</div>
        <div className={cn('font-bold text-orange-600', compact ? 'text-[26px]' : 'text-[30px]')}>#{docNumber}</div>
      </div>
    </div>
  )
}

export function PaperFields({ fields }: { fields: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      {fields.map((f, i) => (
        <div key={i} className="rounded bg-gray-100 px-2.5 py-2">
          <div className="mb-0.5 text-[9.5px] font-bold uppercase tracking-[.05em] text-gray-600">{f.label}</div>
          <div className="text-[13px] font-bold">{f.value}</div>
        </div>
      ))}
    </div>
  )
}

export function PaperColumns({ children }: { children: ReactNode }) {
  return <div className="mb-5 grid grid-cols-1 gap-6 sm:grid-cols-2">{children}</div>
}

export function PaperBlock({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 border-b border-gray-200 pb-1 text-[10px] font-bold uppercase tracking-[.05em] text-gray-600">{title}</div>
      <div className="text-[13px] leading-normal">{children}</div>
    </div>
  )
}

/** Horizontally scrollable box so the line grid never squashes on a narrow window. */
export function PaperLines({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">{children}</div>
    </div>
  )
}

export function PaperLinesHead({ priceLabel = 'Unit price' }: { priceLabel?: string }) {
  return (
    <div className={cn(PAPER_LINE_GRID, 'bg-gray-100 px-2 py-[7px] text-[10px] font-bold uppercase tracking-[.05em] text-gray-600')}>
      <span>#</span><span>Description</span><span className="text-right">Qty</span><span className="text-right">{priceLabel}</span><span className="text-right">Total</span>
    </div>
  )
}

export function PaperLineRow({ n, description, qty, price, total, className }: { n: number; description: ReactNode; qty: ReactNode; price: ReactNode; total: ReactNode; className?: string }) {
  return (
    <div className={cn(PAPER_LINE_GRID, 'border-b border-gray-100 px-2 py-2', className)}>
      <span className="text-xs text-gray-500">{n}</span>
      <span className="min-w-0 whitespace-pre-wrap">{description}</span>
      <span className="text-right">{qty}</span>
      <span className="text-right">{price}</span>
      <span className="pr-1 text-right">{total}</span>
    </div>
  )
}

export function OptionalTag() {
  return <span className="rounded-[3px] bg-blue-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.05em] text-blue-700">Optional</span>
}

export function PaperSectionHeading({ children, optional, controls }: { children: ReactNode; optional?: boolean; controls?: ReactNode }) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-b-[1.5px] border-gray-900 py-1 pl-1 pr-2">
      <div className="min-w-0 flex-[1_1_200px] text-[13.5px] font-bold">{children}</div>
      {optional ? <OptionalTag /> : null}
      {controls}
    </div>
  )
}

/** Dashed row under a table for add-buttons — only ever rendered while editing. */
export function PaperEditRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border border-t-0 border-dashed border-gray-300 p-1.5 font-sans">
      {children}
      <span className="ml-auto text-[11.5px] text-gray-500">Edit-only · not printed</span>
    </div>
  )
}

export const PAPER_GHOST_BUTTON =
  'inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-[13px] font-medium text-orange-800 hover:bg-orange-50 disabled:opacity-50 font-sans'

export function PaperTotals({ rows, grand, after }: { rows: { label: string; value: string }[]; grand: { label: string; value: string }; after?: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <div className="mt-[18px] flex flex-col items-end gap-1.5">
      {rows.map(r => (
        <div key={r.label} className="flex gap-[18px]"><span className="w-[170px] text-right text-gray-600">{r.label}</span><span className="w-[110px] text-right">{r.value}</span></div>
      ))}
      <div className="mt-0.5 flex gap-[18px] border-t-[1.5px] border-orange-500 pt-[7px] text-base font-bold">
        <span className="w-[170px] text-right">{grand.label}</span><span className="w-[110px] text-right text-orange-700">{grand.value}</span>
      </div>
      {(after ?? []).map(r => (
        <div key={r.label} className={cn('flex gap-[18px]', r.strong && 'mt-1 bg-gray-100 py-1.5 text-sm font-bold')}>
          <span className={cn('w-[170px] text-right', !r.strong && 'text-gray-600')}>{r.label}</span><span className="w-[110px] pr-1 text-right">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

export function PaperSignatures({ left, right, leftContent }: { left: string; right: string; leftContent?: ReactNode }) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-9 sm:grid-cols-2">
      <div className="border-t border-gray-300 pt-1.5 text-[11px] text-gray-600">
        {leftContent ?? <div className="h-[30px]" />}
        {left} · Date: ____________
      </div>
      <div className="border-t border-gray-300 pt-1.5 text-[11px] text-gray-600">
        <div className="h-[30px]" />
        {right} · Date: ____________
      </div>
    </div>
  )
}

export function PaperNotes({ blocks }: { blocks: { title: string; content: ReactNode }[] }) {
  if (blocks.length === 0) return null
  return (
    <div className="mt-7 grid grid-cols-1 gap-7 sm:grid-cols-2">
      {blocks.map(b => (
        <div key={b.title}>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[.05em] text-gray-600">{b.title}</div>
          <div className="whitespace-pre-wrap text-xs leading-[1.55] text-gray-700">{b.content}</div>
        </div>
      ))}
    </div>
  )
}

export function PaperFootnote({ show }: { show?: boolean }) {
  if (!show) return null
  return <div className="mt-5 text-center text-[10px] text-gray-500">Powered by www.industryforms.app</div>
}

export function InternalRail({ children, label = 'Internal — not on the document' }: { children: ReactNode; label?: string }) {
  return (
    <aside aria-label={label} className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
      <div className="flex items-center gap-2 px-0.5 text-xs font-semibold uppercase tracking-[.06em] text-gray-600">
        <EyeOff className="h-4 w-4" aria-hidden="true" /> Only your team sees this
      </div>
      {children}
    </aside>
  )
}

export function RailCard({ title, children, tone = 'default', className }: { title?: ReactNode; children: ReactNode; tone?: 'default' | 'accent' | 'info'; className?: string }) {
  return (
    <section
      className={cn(
        'rounded-[10px] p-4 text-sm text-gray-700',
        tone === 'default' && 'border border-dashed border-gray-400/70 bg-gray-50',
        tone === 'accent' && 'border border-orange-500 bg-orange-50/60',
        tone === 'info' && 'border border-blue-300 bg-blue-50',
        className,
      )}
    >
      {title ? <h3 className="mb-2.5 text-sm font-semibold text-gray-900">{title}</h3> : null}
      {children}
    </section>
  )
}

export function RailRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm text-gray-700">
      <span>{label}</span><span className="text-right font-semibold text-gray-900">{value}</span>
    </div>
  )
}

export function PaperLegend({ who = 'customer' }: { who?: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-gray-600 print:hidden">
      <span><i className="mr-1.5 inline-block h-3.5 w-3.5 rounded-[3px] bg-white align-[-2px] ring-1 ring-gray-300" />White page = exactly what the {who} receives</span>
      <span><i className="mr-1.5 inline-block h-3.5 w-3.5 rounded-[3px] border border-dashed border-gray-400 bg-gray-50 align-[-2px]" />Dashed panel = only your team sees it</span>
    </div>
  )
}
