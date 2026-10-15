import { and, asc, eq, inArray, notInArray, or, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import { companies, companyDirectory, productFamilyShares } from '../schema'

export interface FamilyShareRow {
  companyId: string
  companyName: string
  discountPct: number
}

export interface FamilyShareTarget {
  id: string
  name: string
}

/**
 * Whether `companyId` can reach the family through the share chain — it
 * owns it, or someone who can reach it shared it onward (see
 * `app_family_reaches_company`, which reads every share regardless of RLS).
 * Says nothing about the family being published.
 */
export const isFamilySharedWith = async (db: DbLike, familyId: string, companyId: string): Promise<boolean> => {
  const rows = await db.execute<{ reaches: boolean }>(
    sql`SELECT app_family_reaches_company(${familyId}::uuid, ${companyId}::uuid) AS reaches`,
  )
  return rows[0]?.reaches === true
}

/** The shares `fromCompanyId` itself made of this family, with recipient names. */
export const listOutgoingFamilyShares = async (
  db: DbLike,
  familyId: string,
  fromCompanyId: string,
): Promise<FamilyShareRow[]> => {
  const rows = await db
    .select({
      companyId: productFamilyShares.toCompanyId,
      companyName: companyDirectory.name,
      discountPct: productFamilyShares.discountPct,
    })
    .from(productFamilyShares)
    .innerJoin(companyDirectory, eq(productFamilyShares.toCompanyId, companyDirectory.id))
    .where(and(eq(productFamilyShares.productFamilyId, familyId), eq(productFamilyShares.fromCompanyId, fromCompanyId)))
    .orderBy(asc(companyDirectory.name))
  return rows.map((row) => ({ ...row, discountPct: Number(row.discountPct) }))
}

/**
 * Companies that can receive a share: active suppliers and clients. Reads
 * across tenants, so call it from a system transaction; the caller removes
 * itself and the family owner.
 */
export const listFamilyShareTargets = (db: DbLike): Promise<FamilyShareTarget[]> =>
  db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.isActive, true), or(eq(companies.isSupplier, true), eq(companies.isClient, true))))
    .orderBy(asc(companies.name))

/**
 * Replaces the set of shares `fromCompanyId` made of this family: recipients
 * not in `shares` are removed, the rest are added or have their discount
 * updated.
 */
export const replaceOutgoingFamilyShares = async (
  db: DbLike,
  familyId: string,
  fromCompanyId: string,
  shares: Array<{ companyId: string; discountPct: number }>,
): Promise<void> => {
  const keepIds = shares.map((share) => share.companyId)
  await db
    .delete(productFamilyShares)
    .where(
      and(
        eq(productFamilyShares.productFamilyId, familyId),
        eq(productFamilyShares.fromCompanyId, fromCompanyId),
        keepIds.length ? notInArray(productFamilyShares.toCompanyId, keepIds) : undefined,
      ),
    )
  if (shares.length) {
    await db
      .insert(productFamilyShares)
      .values(
        shares.map((share) => ({
          productFamilyId: familyId,
          fromCompanyId,
          toCompanyId: share.companyId,
          discountPct: share.discountPct.toFixed(2),
        })),
      )
      .onConflictDoUpdate({
        target: [
          productFamilyShares.productFamilyId,
          productFamilyShares.fromCompanyId,
          productFamilyShares.toCompanyId,
        ],
        set: { discountPct: sql`excluded.discount_pct`, updatedAt: new Date() },
      })
  }
}

/**
 * The discount each of these families was shared with `companyId` at (the
 * highest, if several companies shared it), by family id. Only shares from a
 * company that can still reach the family count — a share left behind by a
 * revoked upstream sharer is inert.
 */
export const getIncomingShareDiscounts = async (
  db: DbLike,
  companyId: string,
  familyIds: string[],
): Promise<Map<string, number>> => {
  if (familyIds.length === 0) {
    return new Map()
  }
  const rows = await db
    .select({
      familyId: productFamilyShares.productFamilyId,
      discountPct: sql<string>`max(${productFamilyShares.discountPct})`,
    })
    .from(productFamilyShares)
    .where(
      and(
        eq(productFamilyShares.toCompanyId, companyId),
        inArray(productFamilyShares.productFamilyId, familyIds),
        sql`app_family_reaches_company(${productFamilyShares.productFamilyId}, ${productFamilyShares.fromCompanyId})`,
      ),
    )
    .groupBy(productFamilyShares.productFamilyId)
  return new Map(rows.map((row) => [row.familyId, Number(row.discountPct)]))
}
