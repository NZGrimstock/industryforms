import type { PaperCompany } from '@/components/documents/paper'

// The company block printed at the top of every paper document. Accepts the
// loosely-typed `profiles.companies` join every dashboard page already selects.
export function paperCompany(co: unknown): PaperCompany {
  const c = (co ?? {}) as { name?: string | null; email?: string | null; phone?: string | null; gst_number?: string | null; logo_url?: string | null }
  return {
    name: c.name ?? '',
    email: c.email ?? null,
    phone: c.phone ?? null,
    gst_number: c.gst_number ?? null,
    logo_url: c.logo_url ?? null,
  }
}
