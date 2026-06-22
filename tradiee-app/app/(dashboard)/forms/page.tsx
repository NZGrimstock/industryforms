import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { EmptyState } from '@/components/ui/empty-state'
import { FileText, Pencil, Eye } from 'lucide-react'
import Link from 'next/link'
import { NewFormButton } from './client'

export default async function FormsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  const { data: templates } = await supabase
    .from('form_templates')
    .select('id, name, description, is_active, created_at, fields')
    .eq('company_id', profile!.company_id)
    .order('name')

  const templateList = templates ?? []

  return (
    <>
      <Header title="Forms & Site Reports" profile={profile} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-500">Build reusable forms for safety checks, commissioning, and site reports</p>
          <NewFormButton companyId={profile!.company_id} />
        </div>
        <p className="text-xs text-gray-400 mb-6">Forms are filled from the <strong>Job page</strong> — open a job and look for the Site forms card.</p>

        {templateList.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No form templates"
            description="Create a template to start collecting structured site data"
            action={<NewFormButton companyId={profile!.company_id} />}
          />
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {templateList.map(t => {
              const fields = (t.fields as unknown as Array<{ type: string }>) ?? []
              return (
                <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-orange-200 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className="bg-orange-50 rounded-lg p-2">
                      <FileText className="h-4 w-4 text-orange-500" />
                    </div>
                    {!t.is_active && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  <h3 className="font-medium text-gray-900">{t.name}</h3>
                  {t.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{t.description}</p>}
                  <p className="text-xs text-gray-400 mt-2 mb-4">{fields.length} field{fields.length !== 1 ? 's' : ''}</p>
                  <div className="flex gap-2">
                    <Link
                      href={`/forms/${t.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" /> Preview
                    </Link>
                    <Link
                      href={`/forms/${t.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-[var(--accent,#f97316)] border border-orange-200 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
