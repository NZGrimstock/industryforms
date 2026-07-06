/**
 * POST /api/ai/draft-quote
 * Draft a starter set of quote line items from a free-text enquiry/job
 * description, using only items that exist in the company's price list. The
 * caller still confirms / edits the result before sending — no autonomous
 * commerce, just a head-start that beats a blank page.
 *
 * Body:  { description: string, enquiryId?: string }
 * Returns: { title: string, summary: string,
 *            lines: Array<{ priceListItemId?: string, description: string,
 *                           quantity: number, unit: string, unitPrice: number,
 *                           type: 'material'|'labour'|'misc' }> }
 */
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { resolveCompanyUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'

type AiLine = {
  priceListItemId?: string | null
  description: string
  quantity: number
  unit: string
  unitPrice: number
  type: 'material' | 'labour' | 'misc'
}

export async function POST(req: Request) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { description } = await req.json() as { description?: string }
  if (!description || description.trim().length < 5) {
    return NextResponse.json({ error: 'description required' }, { status: 400 })
  }

  const svc = createServiceClient()
  const { data: priceItems } = await svc
    .from('price_list_items')
    .select('id, name, unit, sell_price, type')
    .eq('company_id', auth.companyId)
    .eq('is_active', true)
    .limit(200)

  const catalogue = (priceItems ?? []).map(p => ({
    id: p.id, name: p.name, unit: p.unit, sell_price: Number(p.sell_price), type: p.type,
  }))

  const prompt = [
    'You are helping a NZ/AU tradesperson draft a starter quote from a customer enquiry.',
    'Use ONLY items from the price list below for labour and materials whenever possible — match by id.',
    'You MAY add 1-2 misc lines if the enquiry clearly mentions work not in the price list — leave priceListItemId null and set type "misc".',
    'Be conservative on quantities — better to underestimate than invent specifics not in the source.',
    'Never invent prices for items that are not in the price list.',
    '',
    'Return STRICT JSON:',
    '{ "title": "short job title (max 8 words)",',
    '  "summary": "1-2 sentence customer-facing description",',
    '  "lines": [ { "priceListItemId": "uuid|null", "description": "...", "quantity": 0, "unit": "hr|ea|m|...", "unitPrice": 0, "type": "material|labour|misc" } ] }',
    'Return ONLY the JSON. No markdown, no prose.',
    '',
    `Price list (${catalogue.length} items):`,
    JSON.stringify(catalogue),
    '',
    'Enquiry:',
    description.trim(),
  ].join('\n')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI drafting not configured — set ANTHROPIC_API_KEY in Vercel environment variables' }, { status: 503 })
  }

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const json = JSON.parse(raw.replace(/^```json?\s*|\s*```$/g, '')) as {
      title?: string; summary?: string; lines?: AiLine[]
    }

    // Re-validate each line against the catalogue so the AI can't smuggle bad ids/prices.
    const lookup = new Map(catalogue.map(c => [c.id, c]))
    const safeLines: AiLine[] = (json.lines ?? []).map(l => {
      const item = l.priceListItemId ? lookup.get(l.priceListItemId) : null
      if (item) {
        return {
          priceListItemId: item.id,
          description: l.description?.trim() || item.name,
          quantity: Math.max(0, Number(l.quantity) || 0),
          unit: item.unit ?? 'each',
          unitPrice: item.sell_price,
          type: (item.type as AiLine['type']) ?? 'material',
        }
      }
      return {
        priceListItemId: null,
        description: l.description?.trim() ?? '',
        quantity: Math.max(0, Number(l.quantity) || 0),
        unit: l.unit ?? 'each',
        unitPrice: Math.max(0, Number(l.unitPrice) || 0),
        type: (l.type === 'labour' || l.type === 'misc' ? l.type : 'material') as AiLine['type'],
      }
    }).filter(l => l.description && l.quantity > 0)

    return NextResponse.json({
      title: (json.title ?? '').trim() || description.split('\n')[0].slice(0, 80),
      summary: (json.summary ?? '').trim(),
      lines: safeLines,
    })
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : 'Draft failed'
    return NextResponse.json({ error: m }, { status: 500 })
  }
}
