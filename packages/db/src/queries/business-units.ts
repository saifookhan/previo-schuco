import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import { businessUnits, userBusinessUnits, users } from '../schema'

/**
 * Return only the ids, from `ids`, that actually belong to `companyId` —
 * used to validate an invite's `businessUnitIds` before assignment, so a
 * company-admin can't assign a business unit belonging to another
 * company just because RLS's `user_bu_tenant` policy only checks the
 * invited user's own company, not the business unit's.
 * @param db - RLS-scoped transaction
 * @param companyId - Company the business units must belong to
 * @param ids - Candidate business unit ids to validate
 */
export const filterBusinessUnitIdsByCompany = async (
  db: DbLike,
  companyId: string,
  ids: string[],
): Promise<string[]> => {
  if (ids.length === 0) {
    return []
  }
  const rows = await db
    .select({ id: businessUnits.id })
    .from(businessUnits)
    .where(and(eq(businessUnits.companyId, companyId), inArray(businessUnits.id, ids)))

  return rows.map((row) => row.id)
}

export type BusinessUnitRow = typeof businessUnits.$inferSelect

/** A company's branches with the ids of their users, by name. Explicit company filter, as in `listQuotes`. */
export const listBusinessUnitsWithUsers = async (
  db: DbLike,
  companyId: string,
  { withLogos = true }: { withLogos?: boolean } = {},
): Promise<(BusinessUnitRow & { userIds: string[] })[]> => {
  // Logos are data URLs of up to ~700 KB each: only read them when they are shown.
  const { logoUrl, ...columns } = getTableColumns(businessUnits)
  const units = await db
    .select({ ...columns, logoUrl: withLogos ? logoUrl : sql<string | null>`NULL` })
    .from(businessUnits)
    .where(eq(businessUnits.companyId, companyId))
    .orderBy(asc(businessUnits.name))
  if (units.length === 0) {
    return []
  }
  const memberships = await db
    .select({ userId: userBusinessUnits.userId, businessUnitId: userBusinessUnits.businessUnitId })
    .from(userBusinessUnits)
    .where(
      inArray(
        userBusinessUnits.businessUnitId,
        units.map((unit) => unit.id),
      ),
    )
  return units.map((unit) => ({
    ...unit,
    userIds: memberships.filter((m) => m.businessUnitId === unit.id).map((m) => m.userId),
  }))
}

/** One branch's logo (a data URL), or null. */
export const getBusinessUnitLogo = async (db: DbLike, companyId: string, unitId: string): Promise<string | null> => {
  const [row] = await db
    .select({ logoUrl: businessUnits.logoUrl })
    .from(businessUnits)
    .where(and(eq(businessUnits.companyId, companyId), eq(businessUnits.id, unitId)))
  return row?.logoUrl ?? null
}

export interface BusinessUnitFields {
  name: string
  address: string | null
  email: string | null
  phone: string | null
  primaryColor: string
  logoUrl: string | null
}

export const insertBusinessUnit = async (db: DbLike, companyId: string, input: BusinessUnitFields): Promise<BusinessUnitRow> => {
  const [row] = await db
    .insert(businessUnits)
    .values({ ...input, companyId })
    .returning()
  return row
}

/** Updates one of the company's branches; null if it has no such branch. */
export const updateBusinessUnit = async (
  db: DbLike,
  companyId: string,
  id: string,
  input: BusinessUnitFields,
): Promise<BusinessUnitRow | null> => {
  const [row] = await db
    .update(businessUnits)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(businessUnits.id, id), eq(businessUnits.companyId, companyId)))
    .returning()
  return row ?? null
}

/** Deletes one of the company's branches (its user memberships go with it); false if it has no such branch. */
export const deleteBusinessUnit = async (db: DbLike, companyId: string, id: string): Promise<boolean> => {
  const rows = await db
    .delete(businessUnits)
    .where(and(eq(businessUnits.id, id), eq(businessUnits.companyId, companyId)))
    .returning({ id: businessUnits.id })
  return rows.length > 0
}

/** Replaces the users of a branch; keeps the edit rights of users who stay. */
export const setBusinessUnitUsers = async (db: DbLike, businessUnitId: string, userIds: string[]): Promise<void> => {
  const current = await db
    .select({ userId: userBusinessUnits.userId })
    .from(userBusinessUnits)
    .where(eq(userBusinessUnits.businessUnitId, businessUnitId))
  const keep = new Set(userIds)
  const removed = current.map((row) => row.userId).filter((userId) => !keep.has(userId))
  if (removed.length > 0) {
    await db
      .delete(userBusinessUnits)
      .where(and(eq(userBusinessUnits.businessUnitId, businessUnitId), inArray(userBusinessUnits.userId, removed)))
  }
  const existing = new Set(current.map((row) => row.userId))
  const added = userIds.filter((userId) => !existing.has(userId))
  if (added.length > 0) {
    await db.insert(userBusinessUnits).values(added.map((userId) => ({ userId, businessUnitId })))
  }
}

/** The company's active users, as possible sales contacts on its quotes, with the branches they work for. */
export const listSalesContacts = async (
  db: DbLike,
  companyId: string,
): Promise<{ id: string; name: string | null; email: string; phone: string | null; businessUnitIds: string[] }[]> => {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.status, 'active')))
    .orderBy(asc(users.name), asc(users.email))
  if (rows.length === 0) {
    return []
  }
  const memberships = await db
    .select({ userId: userBusinessUnits.userId, businessUnitId: userBusinessUnits.businessUnitId })
    .from(userBusinessUnits)
    .where(
      inArray(
        userBusinessUnits.userId,
        rows.map((row) => row.id),
      ),
    )
  return rows.map((row) => ({
    ...row,
    businessUnitIds: memberships.filter((m) => m.userId === row.id).map((m) => m.businessUnitId),
  }))
}

/** Sets a user's phone (printed as the quote's sales contact). */
export const updateUserPhone = async (db: DbLike, userId: string, phone: string | null): Promise<boolean> => {
  const rows = await db
    .update(users)
    .set({ phone, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ id: users.id })
  return rows.length > 0
}
