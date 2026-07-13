export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createOpenAIText, OPENAI_MODEL_MINI, OPENAI_MODEL_NANO, parseJsonObject } from '@/lib/openai'

type ParsedSupplierInvoice = {
  supplier?: string | null
  invoice_number?: string | null
  invoice_date?: string | null
  total?: number | null
  items?: Array<{
    description?: string
    quantity?: number
    unit?: string
    unit_cost?: number
    line_total?: number
    part_number?: string | null
  }>
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI parsing not configured — set OPENAI_API_KEY in Vercel environment variables' }, { status: 503 })
  }
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PDF, JPEG, PNG, and WEBP files are supported' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mediaType = file.type as 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
    const fileInput = mediaType === 'application/pdf'
      ? { type: 'input_file' as const, filename: file.name || 'supplier-invoice.pdf', file_data: `data:${mediaType};base64,${base64}` }
      : { type: 'input_image' as const, image_url: `data:${mediaType};base64,${base64}`, detail: 'high' as const }

    const prompt = `Extract all line items from this supplier invoice. Return ONLY a JSON object with this exact structure:
{
  "supplier": "supplier name",
  "invoice_number": "invoice number or null",
  "invoice_date": "YYYY-MM-DD or null",
  "total": 123.45,
  "items": [
    {
      "description": "item description",
      "quantity": 1,
      "unit": "each",
      "unit_cost": 12.34,
      "line_total": 12.34,
      "part_number": "ABC123 or null"
    }
  ]
}

Rules:
- quantity, unit_cost, line_total, and total must be numbers, not strings
- unit should be "each", "m", "m2", "L", "kg", "hr" or similar
- If GST is included on a line, strip it out and return ex-GST unit costs
- Include all product/material lines
- Skip freight, delivery fees, card fees, payment fees, and GST summary lines
- If a value is absent, use null rather than guessing
- Return ONLY the JSON, no markdown and no prose`

    let parsed: ParsedSupplierInvoice
    try {
      const raw = await createOpenAIText({
        model: OPENAI_MODEL_NANO,
        maxOutputTokens: 2048,
        input: [
          {
            role: 'user',
            content: [
              fileInput,
              { type: 'input_text', text: prompt },
            ],
          },
        ],
      })
      parsed = parseJsonObject<ParsedSupplierInvoice>(raw)
      if (!hasUsableLineItems(parsed)) throw new Error('No usable invoice line items found')
      const bad = arithmeticFault(parsed)
      if (bad) throw new Error(`Arithmetic inconsistency (${bad}) — retrying with a stronger model`)
    } catch (nanoError) {
      console.warn('[supplier-invoice/parse] nano parse fallback', nanoError)
      const raw = await createOpenAIText({
        model: OPENAI_MODEL_MINI,
        maxOutputTokens: 2048,
        input: [
          {
            role: 'user',
            content: [
              fileInput,
              { type: 'input_text', text: prompt },
            ],
          },
        ],
      })
      parsed = parseJsonObject<ParsedSupplierInvoice>(raw)
    }

    if (!hasUsableLineItems(parsed)) {
      return NextResponse.json({ error: 'Could not extract usable line items from document' }, { status: 422 })
    }

    return NextResponse.json(normalizeSupplierInvoice(parsed))
  } catch (e: unknown) {
    console.error('[supplier-invoice/parse]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Parse failed' }, { status: 500 })
  }
}

// Deterministic sanity check on the extracted numbers. Returns a fault string
// if the arithmetic is internally impossible, else null. A fault triggers the
// stronger-model re-parse before the human ever sees the figures.
//
// ponytail: two confounder-safe checks only — this parser deliberately strips
// GST from line items and skips freight/fees (see prompt), so sum(line_total)
// is an ex-GST goods subtotal and `total` is the GST+freight-inclusive grand
// total. That means sum(lines) < total is the NORMAL, expected state — a naive
// "must balance to the cent" check would fire the expensive fallback on nearly
// every real invoice. So we only flag the two things that are wrong under
// EVERY interpretation:
//   1. a line where qty*unit_cost disagrees with its own line_total (mis-keyed
//      unit fraction / transcription error — the exact failure the doc worried
//      about), and
//   2. goods subtotal EXCEEDING the grand total (impossible: GST+freight only
//      add on top), which catches duplicated/hallucinated lines.
// Tolerance: 2c or 1% of the figure, whichever is larger, to absorb rounding.
export function arithmeticFault(parsed: ParsedSupplierInvoice): string | null {
  const tol = (x: number) => Math.max(0.02, Math.abs(x) * 0.01)
  for (const item of parsed.items ?? []) {
    const qty = Number(item.quantity)
    const cost = Number(item.unit_cost)
    const line = Number(item.line_total)
    if (!Number.isFinite(qty) || !Number.isFinite(cost) || !Number.isFinite(line)) continue
    if (Math.abs(qty * cost - line) > tol(line)) return 'line total ≠ qty × unit cost'
  }
  const total = Number(parsed.total)
  if (Number.isFinite(total) && total > 0) {
    const sum = (parsed.items ?? []).reduce((s, i) => s + (Number(i.line_total) || 0), 0)
    if (sum - total > tol(total)) return 'line items exceed invoice total'
  }
  return null
}

function hasUsableLineItems(parsed: ParsedSupplierInvoice): boolean {
  return Array.isArray(parsed.items) && parsed.items.some(item => {
    return !!item.description?.trim() && Number(item.quantity) > 0 && Number(item.unit_cost) >= 0
  })
}

function normalizeSupplierInvoice(parsed: ParsedSupplierInvoice) {
  return {
    supplier: parsed.supplier ?? null,
    invoice_number: parsed.invoice_number ?? null,
    invoice_date: parsed.invoice_date ?? null,
    total: typeof parsed.total === 'number' ? parsed.total : null,
    items: (parsed.items ?? [])
      .map(item => ({
        description: item.description?.trim() ?? '',
        quantity: Number(item.quantity) || 0,
        unit: item.unit?.trim() || 'each',
        unit_cost: Number(item.unit_cost) || 0,
        line_total: Number(item.line_total) || (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
        part_number: item.part_number ?? null,
      }))
      .filter(item => item.description && item.quantity > 0),
  }
}
