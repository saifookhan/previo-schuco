import { desc, eq } from 'drizzle-orm'

import type { DbLike } from '../client'
import { companies } from '../schema'

export interface CompanySummary {
  id: string
  name: string
  type: 'platform' | 'supplier' | 'client'
}

export type CompanyRow = typeof companies.$inferSelect

export interface InsertCompanyInput {
  type: 'platform' | 'supplier' | 'client'
  name: string
  vatNumber: string
}

/** Creates a company (starts active). Super-admin only — enforced at the route, not here (see ADR 0012). */
export const insertCompany = async (db: DbLike, input: InsertCompanyInput): Promise<CompanyRow> => {
  const [row] = await db.insert(companies).values(input).returning()
  return row
}

/** Lists every company on the platform, newest first. RLS-scoped: a non-super-admin transaction only ever sees its own single company here. */
export const listAllCompanies = (db: DbLike): Promise<CompanyRow[]> =>
  db.select().from(companies).orderBy(desc(companies.createdAt))

export interface UpdateCompanyInput {
  type?: 'platform' | 'supplier' | 'client'
  name?: string
  vatNumber?: string
}

export const updateCompany = async (
  db: DbLike,
  id: string,
  input: UpdateCompanyInput,
): Promise<CompanyRow | null> => {
  const [row] = await db
    .update(companies)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning()
  return row ?? null
}

/** Activates or deactivates a company. Deactivating blocks every one of its users from logging in (see requireAuth) — it never deletes anything. */
export const setCompanyActive = async (db: DbLike, id: string, isActive: boolean): Promise<CompanyRow | null> => {
  const [row] = await db
    .update(companies)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning()
  return row ?? null
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
