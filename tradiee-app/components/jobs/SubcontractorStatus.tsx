import { createClient, createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_TIMEZONE, formatDate } from '@/lib/datetime'
import { AddSubCostButton } from './add-sub-cost-button'
import { subCostReadyToBill } from '@/lib/job-financials'
import { CheckCircle2 } from 'lucide-react'

interface Props {
  contractorJobId: string
  companyId: string
  profileId: string
  subCostCategoryId: string | null
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#eab308',
  accepted: '#22c55e',
  declined: '#ef4444',
  cancelled: '#6b7280',
}

const JOB_STATUS_COLORS: Record<string, string> = {
  unscheduled: '#6b7280',
  scheduled: '#3b82f6',
  in_progress: '#f97316',
  on_hold: '#eab308',
  completed: '#22c55e',
  cancelled: '#ef4444',
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

function InvitationBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#6b7280'
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}20`, color }}
    >
      <StatusDot color={color} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export async function SubcontractorStatus({ contractorJobId, companyId, profileId, subCostCategoryId }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: viewerProfile } = user
    ? await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle()
    : { data: null }
  const timezone = viewerProfile?.timezone ?? DEFAULT_TIMEZONE

  const [invitationsRes, jobLinksRes] = await Promise.all([
    supabase
      .from('job_invitations')
      .select('id, subcontractor_email, status, accepted_at, declined_at, created_at')
      .eq('job_id', contractorJobId)
      .eq('contractor_company_id', companyId)
      .order('created_at', { ascending: false }),
    // The embedded jobs!subcontractor_job_id(...) join reads the SUB's own
    // job row (and their company name) from the CONTRACTOR's session — RLS
    // on both jobs and companies is company-scoped, so that join always came
    // back null under the normal client and every linked row was silently
    // dropped below. Same cross-company display-name case as
    // settings/page.tsx's referral_credits query; .eq('contractor_company_id')
    // re-establishes the scoping that RLS would otherwise have provided.
    createServiceClient()
      .from('job_links')
      .select('id, subcontractor_job_id, contractor_material_id, jobs!subcontractor_job_id(title, status, job_number, companies(name)), job_invitations!invitation_id(agreed_price)')
      .eq('contractor_job_id', contractorJobId)
      .eq('contractor_company_id', companyId),
  ])

  const invitations = invitationsRes.data ?? []
  const jobLinks = jobLinksRes.data ?? []

  if (invitations.length === 0 && jobLinks.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader><CardTitle>Subcontractors</CardTitle></CardHeader>
      <CardContent className="p-0 pb-2">
        <div className="divide-y divide-gray-50">
          {/* Live job links */}
          {jobLinks.map(link => {
            type LinkedJob = { title: string; status: string; job_number: string; companies: { name: string } | null } | null
            const linkedJob = link.jobs as unknown as LinkedJob
            if (!linkedJob) return null
            const statusColor = JOB_STATUS_COLORS[linkedJob.status] ?? '#6b7280'
            const companyName = linkedJob.companies?.name ?? 'Subcontractor'
            const agreedPrice = (link.job_invitations as unknown as { agreed_price: number | null } | null)?.agreed_price ?? null
            const readyToBill = subCostReadyToBill({ subJobStatus: linkedJob.status, agreedPrice, contractorMaterialId: link.contractor_material_id })
            return (
              <div key={link.id} className="px-6 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{companyName}</p>
                  <p className="text-xs text-gray-400">{linkedJob.job_number} — {linkedJob.title}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${statusColor}18`, color: statusColor }}
                  >
                    <StatusDot color={statusColor} />
                    {linkedJob.status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </span>
                  {readyToBill && agreedPrice != null && (
                    <AddSubCostButton
                      jobLinkId={link.id}
                      contractorJobId={contractorJobId}
                      contractorCompanyId={companyId}
                      profileId={profileId}
                      description={`${companyName} — ${linkedJob.title}`}
                      agreedPrice={agreedPrice}
                      costCategoryId={subCostCategoryId}
                    />
                  )}
                  {link.contractor_material_id && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Added to job cost
                    </span>
                  )}
                </div>
              </div>
            )
          })}

          {/* Invitations */}
          {invitations.map(inv => (
            <div key={inv.id} className="px-6 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">{inv.subcontractor_email}</p>
                {inv.accepted_at && (
                  <p className="text-xs text-gray-400">
                    Accepted {formatDate(inv.accepted_at, timezone, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {inv.declined_at && (
                  <p className="text-xs text-gray-400">
                    Declined {formatDate(inv.declined_at, timezone, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
                {inv.status === 'pending' && (
                  <p className="text-xs text-gray-400">
                    Sent {formatDate(inv.created_at, timezone, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
              <InvitationBadge status={inv.status} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
