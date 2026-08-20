import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { DataType } from '@/lib/import/programs'

interface ImportRow { [key: string]: string }

// 5,000 rows is generous headroom for a CSV import while bounding the loop
// below from an unbounded/oversized payload.
const bodySchema = z.object({
  dataType: z.enum(['customers', 'price_list', 'jobs', 'invoices']),
  rows: z.array(z.record(z.string(), z.string())).max(5000),
  duplicateMode: z.enum(['skip', 'overwrite']).optional(),
  // price_list only — tags every imported/updated row with this supplier.
  supplierId: z.string().uuid().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const service = createServiceClient()
    const { data: profile } = await service
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    const { dataType, rows, duplicateMode, supplierId } = parsed.data as { dataType: DataType; rows: ImportRow[]; duplicateMode?: 'skip' | 'overwrite'; supplierId?: string }
    const companyId = profile.company_id

    // service client bypasses RLS — re-check by hand that a supplierId, if
    // supplied, actually belongs to this company before trusting it, rather
    // than letting a crafted request tag items with another company's row.
    let verifiedSupplierId: string | null = null
    if (supplierId) {
      const { data: supplier } = await service.from('suppliers').select('id').eq('id', supplierId).eq('company_id', companyId).maybeSingle()
      if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 400 })
      verifiedSupplierId = supplier.id
    }

    let inserted = 0
    let skipped = 0
    let updated = 0

    if (dataType === 'customers') {
      for (const row of rows) {
        const name = row.name?.trim()
        if (!name) { skipped++; continue }
        const type = normaliseCustomerType(row.type)
        const payload = {
          company_id: companyId,
          name,
          type,
          contact_person: row.contact_person?.trim() || null,
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          billing_address: row.billing_address?.trim() || null,
          notes: row.notes?.trim() || null,
        }
        const { error } = await service.from('customers').insert(payload)
        if (error) skipped++
        else inserted++
      }
    }

    if (dataType === 'price_list') {
      for (const row of rows) {
        const name = row.name?.trim()
        if (!name) { skipped++; continue }
        const code = row.sku?.trim() || null
        const payload = {
          company_id: companyId,
          name,
          unit: row.unit?.trim() || 'each',
          sell_price: parsePrice(row.sell_price),
          cost_price: parsePrice(row.cost_price),
          category: row.category?.trim() || null,
          code,
          is_active: true,
        }

        if (duplicateMode === 'overwrite' && (code || name)) {
          // Try to find existing by code (preferred) or name
          const match = code
            ? await service.from('price_list_items').select('id').eq('company_id', companyId).eq('code', code).maybeSingle()
            : await service.from('price_list_items').select('id').eq('company_id', companyId).ilike('name', name).maybeSingle()
          if (match.data) {
            // supplier_id only touched when a supplier was actually picked for
            // this import — leaving it out of the update payload means
            // re-importing without one never blanks an item's existing
            // attribution, only setting one ever changes it.
            const updatePayload = verifiedSupplierId ? { ...payload, supplier_id: verifiedSupplierId } : payload
            const { error } = await service.from('price_list_items').update(updatePayload).eq('id', match.data.id)
            if (error) skipped++; else updated++
            continue
          }
        }

        const { error } = await service.from('price_list_items').insert({ ...payload, supplier_id: verifiedSupplierId })
        if (error) skipped++
        else inserted++
      }
    }

    if (dataType === 'jobs') {
      for (const row of rows) {
        const title = row.title?.trim()
        if (!title) { skipped++; continue }

        // Try to match customer by name
        let customerId: string | null = null
        if (row.customer?.trim()) {
          const { data: cust } = await service
            .from('customers')
            .select('id')
            .eq('company_id', companyId)
            .ilike('name', row.customer.trim())
            .maybeSingle()
          customerId = cust?.id ?? null
        }

        if (!customerId) {
          // Create a placeholder customer so the job can be created
          const custName = row.customer?.trim() || 'Imported customer'
          const { data: newCust } = await service
            .from('customers')
            .insert({ company_id: companyId, name: custName, type: 'residential' })
            .select('id')
            .single()
          customerId = newCust?.id ?? null
        }

        if (!customerId) { skipped++; continue }

        const status = normaliseJobStatus(row.status)

        // job_number is assigned by the DB trigger (unique, never reused).
        // Jobs table has description only — no separate notes column
        const desc = [row.description?.trim(), row.notes?.trim()].filter(Boolean).join('\n') || null
        const payload = {
          company_id: companyId,
          customer_id: customerId,
          title,
          description: desc,
          status,
        }
        const { error } = await service.from('jobs').insert(payload)
        if (error) skipped++
        else inserted++
      }
    }

    if (dataType === 'invoices') {
      for (const row of rows) {
        const invoiceNumber = row.invoice_number?.trim()
        const customerName = row.customer?.trim()
        if (!invoiceNumber && !customerName) { skipped++; continue }

        // Try to match or create customer
        let customerId: string | null = null
        if (customerName) {
          const { data: cust } = await service
            .from('customers')
            .select('id')
            .eq('company_id', companyId)
            .ilike('name', customerName)
            .maybeSingle()
          if (cust) {
            customerId = cust.id
          } else {
            const { data: newCust } = await service
              .from('customers')
              .insert({ company_id: companyId, name: customerName, type: 'residential' })
              .select('id')
              .single()
            customerId = newCust?.id ?? null
          }
        }

        const total = parsePrice(row.total)
        const status = normaliseInvoiceStatus(row.status)
        const payload = {
          company_id: companyId,
          customer_id: customerId,
          invoice_number: invoiceNumber || `IMP-${Date.now()}`,
          invoice_date: parseDate(row.date),   // invoices.invoice_date column (added in migration 014)
          due_date: parseDate(row.due_date),
          total,
          status,
          notes: row.description?.trim() || null,
        }
        // Preserve the original invoice number from the old system (RPC sets the
        // skip flag so the auto-numbering trigger doesn't overwrite it).
        const { error } = await service.rpc('import_invoice', { p: payload })
        if (error) skipped++
        else inserted++
      }
    }

    return NextResponse.json({ inserted, skipped, updated })
  } catch (e: unknown) {
    console.error('[import]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Import failed' }, { status: 500 })
  }
}

function normaliseCustomerType(v?: string): 'residential' | 'commercial' {
  const s = (v ?? '').toLowerCase()
  if (s.includes('commercial') || s.includes('business') || s.includes('company')) return 'commercial'
  return 'residential'
}

function normaliseJobStatus(v?: string): string {
  const s = (v ?? '').toLowerCase()
  if (s.includes('progress') || s.includes('active') || s.includes('open')) return 'in_progress'
  if (s.includes('complete') || s.includes('done') || s.includes('finish')) return 'completed'
  if (s.includes('cancel')) return 'cancelled'
  if (s.includes('scheduled') || s.includes('booked')) return 'scheduled'
  return 'unscheduled'
}

function normaliseInvoiceStatus(v?: string): string {
  const s = (v ?? '').toLowerCase()
  if (s.includes('paid') || s.includes('closed')) return 'paid'
  if (s.includes('overdue') || s.includes('late')) return 'overdue'
  if (s.includes('sent') || s.includes('submitted') || s.includes('emailed')) return 'sent'
  if (s.includes('void') || s.includes('cancel')) return 'void'
  return 'draft'
}

function parsePrice(v?: string): number {
  if (!v) return 0
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : Math.round(n * 100) / 100
}

function parseDate(v?: string): string | null {
  if (!v?.trim()) return null
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch { return null }
}
