import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const bodySchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8).max(72), // bcrypt caps at 72 bytes
})

export async function POST(request: Request) {
  try {
    // Sets another user's password via the admin API, so the caller must prove
    // they're an owner/admin of the SAME company as the target. Same guard shape
    // as the invite route — without it any signed-in user could reset anyone's password.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { userId, password } = parsed.data

    const { data: callerProfile } = await supabase.from('profiles').select('company_id, role').eq('id', user.id).single()
    if (!callerProfile || (callerProfile.role !== 'owner' && callerProfile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = createServiceClient()

    // Target must belong to the caller's company.
    const { data: target } = await service.from('profiles').select('company_id').eq('id', userId).single()
    if (!target || target.company_id !== callerProfile.company_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await service.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
