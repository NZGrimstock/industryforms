import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { ImportWizard } from './client'

export default async function ImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()
  const { data: suppliers } = await supabase.from('suppliers').select('id, name').eq('company_id', profile!.company_id).order('name')

  return (
    <>
      <Header title="Import data" profile={profile} />
      <div className="p-6">
        <div className="max-w-2xl mb-6">
          <p className="text-sm text-gray-500">
            Bring your existing data into IndustryForms in minutes. We support imports from Tradify, ServiceM8, Fergus, Simpro, AroFlo, MYOB, and any CSV export.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Import customers first — jobs and invoices will be linked to them automatically.
          </p>
        </div>
        <ImportWizard suppliers={suppliers ?? []} />
      </div>
    </>
  )
}
