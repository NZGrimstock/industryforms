import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Global quick-search across the records a user is allowed to see. RLS already
// scopes rows to the company (and to assigned jobs for staff), so we just run
// a handful of ilike queries and merge the results.
export type SearchResult = {
  type: 'job' | 'customer' | 'quote' | 'invoice'
  id: string
  title: string
  subtitle: string | null
  href: string
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ results: [] }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ results: [] })
  const company = profile.company_id
  const like = `%${q}%`

  const [jobs, customers, quotes, invoices] = await Promise.all([
    supabase.from('jobs').select('id, job_number, title, customers(name)').eq('company_id', company)
      .or(`job_number.ilike.${like},title.ilike.${like},reference.ilike.${like}`).limit(6),
    supabase.from('customers').select('id, name, phone, email').eq('company_id', company)
      .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(6),
    supabase.from('quotes').select('id, quote_number, title, customers(name)').eq('company_id', company)
      .or(`quote_number.ilike.${like},title.ilike.${like},reference.ilike.${like}`).limit(6),
    supabase.from('invoices').select('id, invoice_number, customers(name)').eq('company_id', company)
      .or(`invoice_number.ilike.${like},reference.ilike.${like}`).limit(6),
  ])

  const name = (c: unknown) => (Array.isArray(c) ? c[0] : c) as { name?: string } | null

  const results: SearchResult[] = [
    ...(jobs.data ?? []).map(j => ({
      type: 'job' as const, id: j.id, title: `${j.job_number} · ${j.title}`,
      subtitle: name(j.customers)?.name ?? null, href: `/jobs/${j.id}`,
    })),
    ...(customers.data ?? []).map(c => ({
      type: 'customer' as const, id: c.id, title: c.name,
      subtitle: c.phone ?? c.email ?? null, href: `/customers/${c.id}`,
    })),
    ...(quotes.data ?? []).map(q2 => ({
      type: 'quote' as const, id: q2.id, title: `${q2.quote_number} · ${q2.title ?? 'Quote'}`,
      subtitle: name(q2.customers)?.name ?? null, href: `/quotes/${q2.id}`,
    })),
    ...(invoices.data ?? []).map(i => ({
      type: 'invoice' as const, id: i.id, title: i.invoice_number,
      subtitle: name(i.customers)?.name ?? null, href: `/invoices/${i.id}`,
    })),
  ]

  return NextResponse.json({ results })
}
