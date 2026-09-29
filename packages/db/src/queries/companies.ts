import { eq } from 'drizzle-orm'

import type { DbLike } from '../client'
import { companies } from '../schema'

export interface CompanySummary {
  id: string
  name: string
  type: 'platform' | 'supplier' | 'client'
}

/**
 * Look up a company by id. `companies` has RLS enabled, so this only
 * returns a row when called with a super-admin-scoped transaction (see
 * withRlsTransaction / the X-Tenant-Id header contract) — a raw,
 * unscoped `Db` will always see zero rows.
 * @param db - RLS-scoped transaction handle
 * @param id - Company UUID
 */
export const getCompanyById = async (db: DbLike, id: string): Promise<CompanySummary | null> => {
  const rows = await db
    .select({ id: companies.id, name: companies.name, type: companies.type })
    .from(companies)
    .where(eq(companies.id, id))
    .limit(1)

  return rows[0] ?? null
}
