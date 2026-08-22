import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const bodySchema = z.object({ token: z.string().trim().min(1).max(200) })

type PushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, string>
}

async function sendExpoPush(messages: PushMessage[]) {
  if (!messages.length) return
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  })
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  const { token } = parsed.data

  const serviceClient = createServiceClient()

  // Find invitation
  const { data: invitation, error: invError } = await serviceClient
    .from('job_invitations')
    .select('*')
    .eq('token', token)
    .single()

  if (invError || !invitation) {
    return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
  }

  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: `Invitation is already ${invitation.status}` }, { status: 409 })
  }

  // Try to get authenticated user
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Non-platform acceptance: no auth, no subcontractor_company_id
  if (!user && !invitation.subcontractor_company_id) {
    await serviceClient
      .from('job_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    // Notify contractor
    await notifyContractorAccepted(serviceClient, invitation)

    return NextResponse.json({ jobId: null })
  }

  // Auth required beyond this point
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!callerProfile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  // Non-platform invitation accepted by a logged-in user (shouldn't normally happen but handle gracefully)
  if (!invitation.subcontractor_company_id) {
    await serviceClient
      .from('job_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id)

    await notifyContractorAccepted(serviceClient, invitation)
    return NextResponse.json({ jobId: null })
  }

  // Verify caller belongs to subcontractor company
  if (callerProfile.company_id !== invitation.subcontractor_company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const subContractorCompanyId = invitation.subcontractor_company_id

  // Generate next job number for subcontractor's company
  const { count } = await serviceClient
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', subContractorCompanyId)

  const jobNumber = `JOB-${String((count ?? 0) + 1).padStart(4, '0')}`

  // jobs.customer_id is NOT NULL (001_initial_schema.sql) — the sub's own
  // accounting treats whoever hired them as their customer, so resolve or
  // create a customer record for the contractor's company in the sub's
  // company. Reuse-by-name mirrors the same dedup pattern in
  // app/(dashboard)/jobs/client.tsx's inline "new customer" path.
  const { data: contractorCompany } = await serviceClient
    .from('companies')
    .select('name')
    .eq('id', invitation.contractor_company_id)
    .single()
  const contractorCompanyName = contractorCompany?.name ?? 'Contractor'

  const { data: existingCustomer } = await serviceClient
    .from('customers')
    .select('id')
    .eq('company_id', subContractorCompanyId)
    .ilike('name', contractorCompanyName)
    .limit(1)
    .maybeSingle()

  let customerId = existingCustomer?.id ?? null
  if (!customerId) {
    const { data: createdCustomer, error: custError } = await serviceClient
      .from('customers')
      .insert({ company_id: subContractorCompanyId, name: contractorCompanyName })
      .select('id')
      .single()
    if (custError || !createdCustomer) {
      console.error('[invitations/accept] customer insert error:', custError?.message)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }
    customerId = createdCustomer.id
  }

  // Create a new job in the subcontractor's company
  const { data: newJob, error: jobError } = await serviceClient
    .from('jobs')
    .insert({
      company_id: subContractorCompanyId,
      customer_id: customerId,
      title: invitation.title,
      description: invitation.description ?? null,
      status: 'unscheduled',
      job_number: jobNumber,
    })
    .select('id')
    .single()

  if (jobError || !newJob) {
    console.error('[invitations/accept] job insert error:', jobError?.message)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }

  // Insert job_links. contractor_company_id/subcontractor_company_id are
  // NOT NULL on this table (021_job_invitations.sql) — omitting them here
  // meant every insert silently failed the constraint and was swallowed by
  // the console.error below, so job_links has never actually populated.
  const { error: linkError } = await serviceClient
    .from('job_links')
    .insert({
      invitation_id: invitation.id,
      contractor_job_id: invitation.job_id,
      subcontractor_job_id: newJob.id,
      contractor_company_id: invitation.contractor_company_id,
      subcontractor_company_id: subContractorCompanyId,
    })

  if (linkError) {
    console.error('[invitations/accept] job_links insert error:', linkError.message)
  }

  // Update invitation status
  await serviceClient
    .from('job_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  // Notify contractor company
  await notifyContractorAccepted(serviceClient, invitation)

  return NextResponse.json({ jobId: newJob.id })
}

async function notifyContractorAccepted(
  serviceClient: ReturnType<typeof createServiceClient>,
  invitation: { contractor_company_id: string; title: string; token: string }
) {
  const { data: contractorProfiles } = await serviceClient
    .from('profiles')
    .select('expo_push_token')
    .eq('company_id', invitation.contractor_company_id)
    .eq('is_active', true)
    .not('expo_push_token', 'is', null)

  const messages: PushMessage[] = (contractorProfiles ?? [])
    .filter((p): p is { expo_push_token: string } => typeof p.expo_push_token === 'string')
    .map(p => ({
      to: p.expo_push_token,
      title: 'Invitation accepted',
      body: `Your invitation for "${invitation.title}" was accepted`,
      data: { screen: 'invitation', token: invitation.token },
    }))

  await sendExpoPush(messages)
}
