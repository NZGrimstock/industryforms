import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { TakeoffTool } from './client'

export default async function TakeoffPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('company_id, full_name, role').eq('id', user!.id).single()

  return (
    <>
      <Header title="Takeoff" profile={profile} />
      <TakeoffTool />
    </>
  )
}
