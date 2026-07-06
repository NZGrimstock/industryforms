import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const PROMPTS: Record<string, string> = {
  customer: `Extract customer details from the following speech transcript and return a JSON object with these fields:
{
  "type": "residential" or "commercial",
  "name": "full name or company name",
  "contact_person": "contact name if commercial",
  "email": "email address",
  "phone": "phone number",
  "billing_address": "billing address",
  "notes": "any other notes"
}
Only include fields that were clearly mentioned. Use empty string "" for any field not mentioned.
Return ONLY the raw JSON, no markdown, no explanation.`,

  job: `Extract job details from the following speech transcript and return a JSON object with these fields:
{
  "title": "concise job title (5 words max)",
  "description": "full description of the work required",
  "status": "unscheduled" | "scheduled" | "in_progress"
}
Infer status from context (e.g. "urgent, start now" → in_progress, "next week" → scheduled, otherwise unscheduled).
Use empty string "" for any field not mentioned.
Return ONLY the raw JSON, no markdown, no explanation.`,

  quote_header: `Extract quote details from the following speech transcript and return a JSON object with these fields:
{
  "title": "concise quote title",
  "notes": "any notes or terms to include"
}
Use empty string "" for any field not mentioned.
Return ONLY the raw JSON, no markdown, no explanation.`,

  description: `Rewrite the following into a clear, professional job or quote description.
Fix spelling and grammar. Use plain sentences. Keep it under 3 sentences.
Return ONLY the improved text, no JSON, no explanation, no quotes around it.`,
}

export async function POST(request: Request) {
  try {
    const { transcript, mode } = await request.json()
    if (!transcript || !mode) return NextResponse.json({ error: 'Missing transcript or mode' }, { status: 400 })

    const prompt = PROMPTS[mode]
    if (!prompt) return NextResponse.json({ error: 'Unknown mode' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI voice parsing not configured — set ANTHROPIC_API_KEY in Vercel environment variables' }, { status: 503 })
    }

    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `${prompt}\n\nTranscript: "${transcript}"`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    if (mode === 'description') {
      return NextResponse.json({ improved: text })
    }

    // Parse JSON response
    const json = JSON.parse(text)
    return NextResponse.json(json)
  } catch (e: unknown) {
    console.error('[voice/parse]', e)
    const msg = e instanceof Error ? e.message : 'Parse failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
