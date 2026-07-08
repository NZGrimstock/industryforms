export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { resolveCompanyUser } from '@/lib/api-auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const auth = await resolveCompanyUser(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { action } = await req.json() as { action?: string }
  const svc = createServiceClient()

  if (action === 'disable') {
    // Single atomic transaction (see migration 20260709105055): deletes every
    // tracked row — including anything the user created while test mode was
    // on, not just the original seed — and only clears test_mode if the
    // whole cleanup succeeds. A partial failure now surfaces as an error
    // instead of silently leaving orphaned "real-looking" data behind.
    const { error } = await svc.rpc('disable_test_mode', { p_company_id: auth.companyId })
    if (error) return NextResponse.json({ error: `Could not fully clear test data: ${error.message}` }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'enable') {
    // Seed demo data
    const cid = auth.companyId
    const uid = auth.userId
    const ids: Record<string, string[]> = {}

    // 1. Suppliers
    const { data: suppliers } = await svc.from('suppliers').insert([
      { company_id: cid, name: 'Tradelink NZ', email: 'orders@tradelink.co.nz', phone: '09 277 7300', address: '123 Great South Rd, Manukau, Auckland' },
      { company_id: cid, name: 'Plumbing World', email: 'auckland@plumbingworld.co.nz', phone: '09 444 5500', address: '45 Albany Hwy, Albany, Auckland' },
    ]).select('id')
    ids.suppliers = (suppliers ?? []).map(r => r.id)

    // 2. Customers
    const { data: customers } = await svc.from('customers').insert([
      { company_id: cid, name: 'Northshore Builders Ltd', type: 'commercial', email: 'admin@northshorebuilders.co.nz', phone: '09 484 2200', billing_address: '12 Taharoto Rd, Takapuna, Auckland 0622' },
      { company_id: cid, name: 'James & Sarah Smith', type: 'residential', email: 'j.smith@gmail.com', phone: '021 555 1234', billing_address: '45 Beachfront Dr, Orewa, Auckland 0931' },
      { company_id: cid, name: 'Auckland Commercial Properties', type: 'commercial', email: 'facilities@acp.co.nz', phone: '09 309 7700', billing_address: '50 Queen St, Auckland CBD 1010' },
    ]).select('id')
    ids.customers = (customers ?? []).map(r => r.id)
    const [custBiz, custRes, custBig] = ids.customers

    // 3. Customer sites (cascades on customer delete — not tracked separately)
    if (ids.customers.length >= 3) {
      await svc.from('customer_sites').insert([
        { customer_id: ids.customers[0], address: '12 Taharoto Rd, Takapuna, Auckland 0622', label: 'Main office' },
        { customer_id: ids.customers[1], address: '45 Beachfront Dr, Orewa, Auckland 0931', label: 'Home' },
        { customer_id: ids.customers[2], address: '50 Queen St, Auckland CBD 1010', label: 'Head office' },
        { customer_id: ids.customers[2], address: '8 Wiri Station Rd, Manukau, Auckland 2104', label: 'Warehouse' },
      ])
    }

    // 4. Enquiries
    const { data: enquiries } = await svc.from('enquiries').insert([
      { company_id: cid, customer_name: 'Mike Thompson', customer_email: 'mike.t@email.co.nz', customer_phone: '021 888 4455', description: 'Looking to get a heat pump installed in the lounge — 6m x 4m room, currently no air con.', source: 'website', status: 'new' },
      { company_id: cid, customer_name: 'Foodstuffs North Island', customer_email: 'maintenance@foodstuffs.co.nz', customer_phone: '09 526 9900', description: 'Full electrical rewire required for commercial kitchen upgrade at our Henderson depot.', source: 'phone', status: 'contacted' },
    ]).select('id')
    ids.enquiries = (enquiries ?? []).map(r => r.id)

    // 4. Jobs
    const { data: jobs } = await svc.from('jobs').insert([
      { company_id: cid, customer_id: custBiz, job_number: 'J-TEST-001', title: 'Heat pump installation – Henderson depot', description: 'Supply and install Mitsubishi 7kW unit in warehouse office.', status: 'in_progress' },
      { company_id: cid, customer_id: custRes, job_number: 'J-TEST-002', title: 'Bathroom renovation – Orewa', description: 'Full tile-and-fit bathroom renovation. New vanity, shower, toilet.', status: 'scheduled' },
      { company_id: cid, customer_id: custBig, job_number: 'J-TEST-003', title: 'Switchboard upgrade – Queen St', description: 'Replace and upgrade main switchboard, add RCDs, bring to current code.', status: 'completed' },
      { company_id: cid, customer_id: custRes, job_number: 'J-TEST-004', title: 'Kitchen lighting upgrade – Orewa', description: 'Replace halogen downlights with LED, add under-cabinet strip lighting.', status: 'unscheduled' },
      { company_id: cid, customer_id: custBiz, job_number: 'J-TEST-005', title: 'Security camera system – Northshore', description: 'Install 6x IP cameras, NVR, remote access setup.', status: 'completed' },
    ]).select('id')
    ids.jobs = (jobs ?? []).map(r => r.id)
    const [job1, , job3, , job5] = ids.jobs

    // 5. Invoices
    const { data: invoices } = await svc.from('invoices').insert([
      { company_id: cid, customer_id: custBig, job_id: job3, invoice_number: 'INV-TEST-001', status: 'paid', subtotal: 1850.00, gst_amount: 277.50, total: 2127.50, amount_paid: 2127.50, due_date: '2026-06-15', notes: 'Test demo invoice – paid' },
      { company_id: cid, customer_id: custRes, job_id: job5, invoice_number: 'INV-TEST-002', status: 'sent', subtotal: 4200.00, gst_amount: 630.00, total: 4830.00, amount_paid: 0, due_date: '2026-07-20', notes: 'Test demo invoice – outstanding' },
      { company_id: cid, customer_id: custBiz, job_id: job1, invoice_number: 'INV-TEST-003', status: 'draft', subtotal: 3100.00, gst_amount: 465.00, total: 3565.00, amount_paid: 0, notes: 'Test demo invoice – draft' },
    ]).select('id')
    ids.invoices = (invoices ?? []).map(r => r.id)

    // 6. Purchase orders
    const sup1 = ids.suppliers[0]
    const { data: pos } = await svc.from('purchase_orders').insert([
      { company_id: cid, supplier_id: sup1, job_id: job1, po_number: 'PO-TEST-001', status: 'sent', order_date: '2026-06-28', expected_date: '2026-07-05', subtotal: 680.00, gst_amount: 102.00, total: 782.00, notes: 'Heat pump unit + refrigerant', created_by: uid },
      { company_id: cid, supplier_id: ids.suppliers[1], po_number: 'PO-TEST-002', status: 'received', order_date: '2026-06-20', subtotal: 290.00, gst_amount: 43.50, total: 333.50, notes: 'Plumbing fittings for bathroom reno', created_by: uid },
    ]).select('id')
    ids.purchase_orders = (pos ?? []).map(r => r.id)

    // 7. Bills
    const { data: bills } = await svc.from('bills').insert([
      { company_id: cid, supplier_id: sup1, reference: 'TL-88421', status: 'unpaid', bill_date: '2026-07-01', due_date: '2026-07-31', subtotal: 320.00, gst_amount: 48.00, total: 368.00, notes: 'Cable and connectors', created_by: uid },
      { company_id: cid, supplier_id: ids.suppliers[1], reference: 'PW-55203', status: 'paid', bill_date: '2026-06-15', subtotal: 195.00, gst_amount: 29.25, total: 224.25, amount_paid: 224.25, notes: 'Tap fittings', created_by: uid },
    ]).select('id')
    ids.bills = (bills ?? []).map(r => r.id)

    // 8. Travel logs
    const now = new Date()
    const day = (n: number) => new Date(now.getTime() - n * 86400000)
    const { data: tlogs } = await svc.from('travel_logs').insert([
      { company_id: cid, profile_id: uid, started_at: new Date(day(1).setHours(8, 5, 0, 0)), ended_at: new Date(day(1).setHours(8, 32, 0, 0)), distance_km: 18.4, purpose: 'work', job_id: job1, is_auto: true, notes: 'Trip to Henderson depot' },
      { company_id: cid, profile_id: uid, started_at: new Date(day(3).setHours(7, 50, 0, 0)), ended_at: new Date(day(3).setHours(8, 15, 0, 0)), distance_km: 22.1, purpose: 'work', job_id: job3, is_auto: true, notes: 'Trip to Queen St' },
      { company_id: cid, profile_id: uid, started_at: new Date(day(5).setHours(16, 30, 0, 0)), ended_at: new Date(day(5).setHours(16, 55, 0, 0)), distance_km: 11.7, purpose: 'personal', is_auto: true },
    ]).select('id')
    ids.travel_logs = (tlogs ?? []).map(r => r.id)

    // 9. Projects
    const { data: projects } = await svc.from('projects').insert([
      { company_id: cid, customer_id: custRes, name: 'Orewa Full Home Renovation', description: 'Kitchen, bathrooms, deck and electrical throughout.', status: 'active', total_budget: 85000, start_date: '2026-06-01', target_end_date: '2026-10-30' },
      { company_id: cid, customer_id: custBig, name: 'CBD Office Fit-Out – Level 12', description: 'Electrical, data cabling, LED lighting and AV for new tenancy fit-out.', status: 'planning', total_budget: 42000, start_date: '2026-08-01' },
    ]).select('id')
    ids.projects = (projects ?? []).map(r => r.id)

    await svc.from('companies').update({ test_mode: true, test_data_ids: ids }).eq('id', cid)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
