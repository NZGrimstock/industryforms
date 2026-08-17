/**
 * POST /api/ai/rewrite
 * General-purpose AI rewriter for quote/job/enquiry descriptions and customer-
 * facing messages. Body: { text: string, mode?: 'description' | 'professional'
 * | 'friendly' | 'shorter' | 'longer' }.
 * Returns: { improved: string }
 */
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { resolveCompanyUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'
import { isFreePlanCompany } from '@/lib/billing'

const STYLE: Record<string, string> = {
  description: 'a clear, professional job or quote description — plain sentences, fix spelling/grammar, keep it under 3 sentences',
  professional: 'a polished, professional version — confident but not stiff, third-person if appropriate, keep length similar',
  friendly: 'a friendly, plain-English version — warm but not casual, suitable for a tradesperson talking to a homeowner',
  shorter: 'a tighter version with the same meaning — cut filler, keep specifics',
  longer: 'a more thorough version that fleshes out the work involved without inventing details',
}

const bodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
  mode: z.enum(['description', 'professional', 'friendly', 'shorter', 'longer']).optional(),
})

export async function POST(req: Request) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isFreePlanCompany(createServiceClient(), auth.companyId)) {
    return NextResponse.json({ error: 'AI rewrite requires a paid plan.' }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { text, mode } = parsed.data
  const style = STYLE[mode ?? 'description'] ?? STYLE.description

  const prompt =
    `Rewrite the following into ${style}.\n` +
    `Do NOT invent prices, dates, names, or technical details that aren't in the source.\n` +
    `Return ONLY the rewritten text — no markdown, no quotes around it, no preamble.\n\n` +
    `Source:\n${text.trim()}`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI rewrite not configured — set ANTHROPIC_API_KEY in Vercel environment variables' }, { status: 503 })
  }

  try {
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const out = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    return NextResponse.json({ improved: out })
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : 'Rewrite failed'
    return NextResponse.json({ error: m }, { status: 500 })
  }
}
