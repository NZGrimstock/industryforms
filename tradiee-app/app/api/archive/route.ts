import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_TABLES = ['customers', 'profiles'] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

export async function POST(req: NextRequest) {
  const { table, id } = await req.json() as { table: string; id: string }
  if (!ALLOWED_TABLES.includes(table as AllowedTable) || !id) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (table === 'profiles') {
    if (!['owner', 'admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (id === user.id) return NextResponse.json({ error: 'You cannot archive your own account' }, { status: 400 })
  }

  const { data: row } = await supabase.from(table as AllowedTable).select('company_id').eq('id', id).single()
  if (!row || row.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const payload = table === 'customers'
    ? { is_active: false, archived_at: new Date().toISOString() }
    : { is_active: false }

  const { error } = await supabase.from(table as AllowedTable).update(payload).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
