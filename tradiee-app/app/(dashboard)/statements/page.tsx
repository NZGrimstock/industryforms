import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { buildCustomerStatements, type StatementInvoice, type CustomerStatement } from '@/lib/statement'
import { StatementsClient } from './client'

export default async function StatementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*, companies!company_id(id, name, country, statement_run_interval, statement_run_next)').eq('id', user!.id).single()
  const company = profile!.companies as unknown as { id: string; name: string; country: string; statement_run_interval: string | null; statement_run_next: string | null }

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, customer_id, invoice_number, status, total, amount_paid, due_date, created_at')
    .eq('company_id', company.id)
    .in('status', ['sent', 'partially_paid', 'overdue'])

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, email, phone')
    .eq('company_id', company.id)

  const statements = buildCustomerStatements((invoices ?? []) as StatementInvoice[])
  const customerById = new Map((customers ?? []).map(c => [c.id, c]))

  type Row = { customer: { id: string; name: string; email: string | null; phone: string | null }; statement: CustomerStatement }
  const rows: Row[] = [...statements.values()]
    .map(s => {
      const c = customerById.get(s.customerId)
      return c ? { customer: c, statement: s } : null
    })
    .filter((r): r is Row => r !== null)
    .sort((a, b) => b.statement.outstanding - a.statement.outstanding)

  const currency = company.country === 'AU' ? 'AUD' : 'NZD'

  return (
    <>
      <Header title="Statements" profile={profile} />
      <div className="p-6 space-y-6 max-w-5xl">
        <StatementsClient
          rows={rows}
          currency={currency}
          companyId={company.id}
          initialInterval={company.statement_run_interval}
          initialNext={company.statement_run_next}
        />
      </div>
    </>
  )
}
