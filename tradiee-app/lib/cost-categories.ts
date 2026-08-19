// Cost categories: per-company definitions, seeded once at signup
// (app/api/auth/signup/route.ts). Unlike job_statuses (free text on jobs.status,
// no FK), job_materials.cost_category_id is a real foreign key — a row here
// must actually exist to be selectable, so there is deliberately no
// job-statuses-style "fall back to a constant when empty" here: a fabricated
// id that isn't a real row would look pickable and then fail the FK on
// insert. If a company has somehow deleted every category, the picker below
// just shows none; a job material can always have no category (nullable FK).

export type CostCategory = { id: string; name: string; sort_order: number }

export const DEFAULT_COST_CATEGORIES = [
  'Labour', 'Materials', 'Subcontractors', 'Plant & equipment', 'Site costs', 'Permits & fees', 'Other',
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCostCategories(supabase: any, companyId: string): Promise<CostCategory[]> {
  const { data } = await supabase
    .from('cost_categories')
    .select('id, name, sort_order')
    .eq('company_id', companyId)
    .order('sort_order')
  return (data ?? []) as CostCategory[]
}
