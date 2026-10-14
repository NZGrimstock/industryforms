// Orders a quote's sections and their lines the same way everywhere the quote
// is shown — the paper screen, the printed PDF and the mobile PDF route — and
// numbers lines 1..n straight through all sections, so line "7" on screen is
// line "7" on paper. Pure: no imports, checked by scripts/check-quote-sections.mjs.

export type RawQuoteLine = {
  sort_order: number | string | null
} & Record<string, unknown>

export type RawQuoteSection<L extends RawQuoteLine = RawQuoteLine> = {
  title?: string | null
  is_optional?: boolean | null
  sort_order: number | string | null
  quote_line_items?: L[] | null
}

export type OrderedQuoteSection<L extends RawQuoteLine = RawQuoteLine> = {
  title: string
  is_optional: boolean
  lines: (L & { n: number })[]
}

const order = (v: number | string | null | undefined) => Number(v ?? 0) || 0

export function orderQuoteSections<L extends RawQuoteLine>(sections: RawQuoteSection<L>[] | null | undefined): OrderedQuoteSection<L>[] {
  let n = 0
  return [...(sections ?? [])]
    .sort((a, b) => order(a.sort_order) - order(b.sort_order))
    .map(s => ({
      title: s.title ?? '',
      is_optional: !!s.is_optional,
      lines: [...(s.quote_line_items ?? [])]
        .sort((a, b) => order(a.sort_order) - order(b.sort_order))
        .map(l => ({ ...l, n: ++n })),
    }))
}
