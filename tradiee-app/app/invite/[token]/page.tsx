import { createServiceClient } from '@/lib/supabase/server'
import { Wrench } from 'lucide-react'
import { PublicInviteActions } from './client'

export default async function PublicInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: invitation } = await supabase
    .from('job_invitations')
    .select('*, companies:contractor_company_id(name, email, phone)')
    .eq('token', token)
    .single()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const signupUrl = `${appUrl}/signup`

  if (!invitation) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wrench className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Invitation not found</h1>
          <p className="text-sm text-gray-500">This invitation link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  if (invitation.status !== 'pending') {
    const statusMessages: Record<string, string> = {
      accepted: 'This invitation has already been accepted.',
      declined: 'This invitation has been declined.',
      cancelled: 'This invitation has been cancelled.',
    }
    const msg = statusMessages[invitation.status] ?? `This invitation is ${invitation.status}.`
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wrench className="h-6 w-6 text-gray-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Invitation {invitation.status}</h1>
          <p className="text-sm text-gray-500">{msg}</p>
        </div>
      </div>
    )
  }

  const company = invitation.companies as { name: string; email: string | null; phone: string | null } | null
  const contractorName = company?.name ?? 'A contractor'

  const dueDateStr = invitation.due_date
    ? new Date(invitation.due_date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const priceStr = invitation.agreed_price != null
    ? new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(Number(invitation.agreed_price))
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center">
              <Wrench className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">{contractorName}</span>
          </div>
          {company?.email && (
            <p className="text-xs text-gray-400">{company.email}</p>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Job invitation</p>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{invitation.title}</h1>
          <p className="text-sm text-gray-500 mb-4">{contractorName} has invited you to take on this job.</p>

          {invitation.description && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{invitation.description}</p>
            </div>
          )}

          <div className="space-y-2">
            {invitation.project_address && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-gray-400 shrink-0">📍</span>
                <span className="text-gray-700">{invitation.project_address}</span>
              </div>
            )}
            {dueDateStr && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-gray-400 shrink-0">📅</span>
                <span className="text-gray-700">Due: {dueDateStr}</span>
              </div>
            )}
            {priceStr && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-gray-400 shrink-0">💰</span>
                <span className="font-semibold text-green-700">Agreed price: {priceStr}</span>
              </div>
            )}
          </div>
        </div>

        <PublicInviteActions token={token} signupUrl={signupUrl} />

        <p className="text-center text-xs text-gray-300 pb-4">Powered by IndustryForms</p>
      </div>
    </div>
  )
}
