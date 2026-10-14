// Quote section ordering + line numbering shared by the paper screen and PDFs.
// Run from tradiee-app/:  node scripts/check-quote-sections.mjs

import assert from 'node:assert/strict'
import { orderQuoteSections } from '../lib/quote-sections.ts'

// Sections and lines come back from supabase in arbitrary order.
const out = orderQuoteSections([
  { title: 'LED downlights', is_optional: false, sort_order: 1, quote_line_items: [
    { id: 'd2', sort_order: 1 }, { id: 'd1', sort_order: 0 },
  ] },
  { title: 'Kitchen rewire', is_optional: false, sort_order: 0, quote_line_items: [
    { id: 'k1', sort_order: 0 }, { id: 'k3', sort_order: 2 }, { id: 'k2', sort_order: 1 },
  ] },
  { title: 'Strip lighting', is_optional: true, sort_order: 2, quote_line_items: [{ id: 's1', sort_order: 0 }] },
])
assert.deepEqual(out.map(s => s.title), ['Kitchen rewire', 'LED downlights', 'Strip lighting'], 'sections by sort_order')
assert.deepEqual(out.flatMap(s => s.lines.map(l => l.id)), ['k1', 'k2', 'k3', 'd1', 'd2', 's1'], 'lines by sort_order within section')
assert.deepEqual(out.flatMap(s => s.lines.map(l => l.n)), [1, 2, 3, 4, 5, 6], 'numbering runs straight through all sections')
assert.equal(out[2].is_optional, true, 'optional flag carried')
assert.equal(out[0].lines[0].id, 'k1', 'other line fields carried through')

// numeric columns arrive from supabase-js as strings — '10' must sort after '9'.
const str = orderQuoteSections([{ title: 'A', sort_order: '0', quote_line_items: [{ id: 'b', sort_order: '10' }, { id: 'a', sort_order: '9' }] }])
assert.deepEqual(str[0].lines.map(l => l.id), ['a', 'b'], 'string sort_order compared numerically')

// Empty / missing input.
assert.deepEqual(orderQuoteSections(null), [])
assert.deepEqual(orderQuoteSections([{ title: null, sort_order: 0, quote_line_items: null }]), [{ title: '', is_optional: false, lines: [] }])

// Empty section does not consume a number.
const gap = orderQuoteSections([
  { title: 'Empty', sort_order: 0, quote_line_items: [] },
  { title: 'Full', sort_order: 1, quote_line_items: [{ id: 'x', sort_order: 0 }] },
])
assert.equal(gap[1].lines[0].n, 1, 'empty sections do not skip numbers')

// Input not mutated.
const input = [{ title: 'Z', sort_order: 1, quote_line_items: [{ id: 'q', sort_order: 1 }, { id: 'p', sort_order: 0 }] }]
orderQuoteSections(input)
assert.equal(input[0].quote_line_items[0].id, 'q', 'does not reorder the caller\'s arrays')

console.log('check-quote-sections: all assertions passed')
