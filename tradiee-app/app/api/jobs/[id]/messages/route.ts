// POST /api/jobs/[id]/messages { body }
//
// Posts a message to a job's admin↔technician thread and pushes everyone else
// involved in that job. Messages are `job_notes` rows with kind='message' —
// see JOB_MESSAGING_SCOPE.md and migration 20260812100000 for why they share a
// table with notes rather than having their own.
//
// Goes through a server route rather than a direct client insert (which RLS
// would happily allow) because the push step needs the service client to read
// other people's expo_push_token. That matches how /api/sms/send already works.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { notifyJobThread } from '@/lib/push'

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { body } = parsed.data

  const service = createServiceClient()
  const { data: job } = await service
    .from('jobs')
    .select('id, job_number, company_id, assigned_to')
    .eq('id', id)
    .single()
  if (!job || job.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  // Mirrors the RLS predicate from migration 20260701082916 — admin/owner, the
  // primary assignee, or a secondary assignee. Re-checked here because the
  // service client below bypasses RLS entirely.
  let allowed = auth.role === 'owner' || auth.role === 'admin' || job.assigned_to === auth.userId
  if (!allowed) {
    const { data: assignee } = await service
      .from('job_assignees')
      .select('id')
      .eq('job_id', id)
      .eq('profile_id', auth.userId)
      .limit(1)
      .maybeSingle()
    allowed = !!assignee
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: inserted, error } = await service
    .from('job_notes')
    .insert({ job_id: id, author_id: auth.userId, body, kind: 'message' })
    .select('id, body, author_id, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: author } = await service
    .from('profiles')
    .select('full_name')
    .eq('id', auth.userId)
    .single()

  // Best-effort — a push failure must never lose the message that was just
  // successfully written.
  try {
    await notifyJobThread(service, {
      jobId: id,
      companyId: auth.companyId,
      authorId: auth.userId,
      authorName: author?.full_name ?? 'Someone',
      jobNumber: job.job_number,
      body,
    })
  } catch (pushError) {
    console.error('[job-messages] push failed', pushError)
  }

  return NextResponse.json({ ok: true, message: inserted })
}
