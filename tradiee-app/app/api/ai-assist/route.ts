export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { resolveCompanyUser } from '@/lib/api-auth'

const SYSTEM = `You are a helpful assistant built into IndustryForms — a job management platform for NZ and AU tradespeople (electricians, plumbers, builders, etc.).

You help users navigate and use IndustryForms. Key features:
- Dashboard: overview of jobs, invoices, revenue at a glance
- Customers: add/edit/archive, view job and invoice history per customer
- Enquiries: capture inbound leads, convert to quotes or jobs
- Jobs: create and manage field jobs, assign staff, track progress, add materials and notes, photo uploads
- Quotes: create and send quotes to customers, get digital acceptance
- Invoices: create invoices from jobs or from scratch, send by email/SMS, track payment
- Price list: manage your labour rates and material prices with markup
- Purchase orders: raise POs to suppliers, receive stock
- Bills: track supplier invoices (accounts payable)
- Timesheets: staff log hours against jobs; owners review and approve
- Vehicle logbook: GPS auto-tracking of trips; allocate to jobs for travel time
- Schedule: drag-and-drop calendar for job visits
- Staff: invite and manage team members with roles (owner/admin/staff)
- Projects: multi-stage large jobs spanning many sub-jobs and invoices
- Reports: revenue, outstanding invoices, job profitability
- Settings: business details, branding, tax, integrations (Xero, Google Calendar, Stripe)

Keep answers concise, practical, and step-by-step where helpful. If unsure, say so.`

export async function POST(req: Request) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message, history } = await req.json() as {
    message?: string
    history?: Array<{ role: 'user' | 'assistant'; text: string }>
  }
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI assistant not configured — set ANTHROPIC_API_KEY in Vercel environment variables' }, { status: 503 })
  }

  const client = new Anthropic({ apiKey })
  const prior = (history ?? []).slice(-8).map(m => ({
    role: m.role,
    content: m.text,
  })) as Anthropic.MessageParam[]

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM,
      messages: [...prior, { role: 'user', content: message.trim() }],
    })
    const reply = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : 'Sorry, I could not generate a response.'
    return NextResponse.json({ reply })
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : 'AI assistant failed'
    return NextResponse.json({ error: m }, { status: 500 })
  }
}
