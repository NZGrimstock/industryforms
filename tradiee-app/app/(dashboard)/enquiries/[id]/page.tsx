import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { nextDocNumber } from '@/lib/numbering'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate, formatDateTime } from '@/lib/utils'
import { EnquiryDetailClient } from './client'
import Link from 'next/link'
import { Phone, Mail, MapPin } from 'lucide-react'

export default async function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const { data: enquiry } = await supabase
    .from('enquiries')
    .select('*, profiles(full_name)')
    .eq('id', id)
    .eq('company_id', profile!.company_id)
    .single()

  if (!enquiry) notFound()

  const [{ data: team }, { data: customers }, nextQuoteNumber, nextJobNumber] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('company_id', profile!.company_id).eq('is_active', true),
    supabase.from('customers').select('id, name').eq('company_id', profile!.company_id).order('name'),
    nextDocNumber(supabase, profile!.company_id, 'quote'),
    nextDocNumber(supabase, profile!.company_id, 'job'),
  ])

  return (
    <>
      <Header title={`Enquiry — ${enquiry.customer_name}`} profile={profile} />
      <div className="p-6 space-y-6 max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-semibold text-gray-900">{enquiry.customer_name}</h2>
              <StatusBadge status={enquiry.status} />
            </div>
            <p className="text-sm text-gray-500 capitalize">Source: {enquiry.source.replace(/_/g, ' ')}</p>
            {enquiry.follow_up_at && (
              <p className="text-sm text-orange-500 mt-1">Follow up: {formatDateTime(enquiry.follow_up_at)}</p>
            )}
          </div>
          <EnquiryDetailClient
            enquiry={enquiry}
            companyId={profile!.company_id}
            profileId={user!.id}
            team={team ?? []}
            customers={customers ?? []}
            nextQuoteNumber={nextQuoteNumber}
            nextJobNumber={nextJobNumber}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {enquiry.customer_email && (
                <a href={`mailto:${enquiry.customer_email}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-orange-500">
                  <Mail className="h-4 w-4 text-gray-400" /> {enquiry.customer_email}
                </a>
              )}
              {enquiry.customer_phone && (
                <a href={`tel:${enquiry.customer_phone}`} className="flex items-center gap-2 text-sm text-gray-700 hover:text-orange-500">
                  <Phone className="h-4 w-4 text-gray-400" /> {enquiry.customer_phone}
                </a>
              )}
              {enquiry.address && (
                <p className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" /> {enquiry.address}
                </p>
              )}
              {!enquiry.customer_email && !enquiry.customer_phone && !enquiry.address && (
                <p className="text-sm text-gray-400">No contact details</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Assigned to</span>
                <span className="text-gray-700">{(enquiry.profiles as {full_name: string} | null)?.full_name ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Received</span>
                <span className="text-gray-700">{formatDate(enquiry.created_at)}</span>
              </div>
              {enquiry.converted_to_quote_id && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Converted to quote</span>
                  <Link href={`/quotes/${enquiry.converted_to_quote_id}`} className="text-orange-500 hover:underline">View quote</Link>
                </div>
              )}
              {enquiry.converted_to_job_id && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Converted to job</span>
                  <Link href={`/jobs/${enquiry.converted_to_job_id}`} className="text-orange-500 hover:underline">View job</Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {enquiry.description && (
          <Card>
            <CardHeader><CardTitle>Work description</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{enquiry.description}</p>
            </CardContent>
          </Card>
        )}

        {enquiry.notes && (
          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{enquiry.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
