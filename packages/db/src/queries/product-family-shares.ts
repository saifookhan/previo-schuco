import { aliasedTable, and, asc, desc, eq, exists, inArray, ne, notInArray, or, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import {
  characteristics,
  companies,
  companyConnections,
  companyDirectory,
  productFamilyShareItems,
  productFamilyShares,
  productLines,
} from '../schema'

/** What a share gives the recipient for one product line or option. */
export interface FamilyShareItemValues {
  discountPct: number
  markupPct: number
  installationHours: number
}

/** One share item: exactly one of productLineId/characteristicId is set. */
export interface FamilyShareItem extends FamilyShareItemValues {
  productLineId: string | null
  characteristicId: string | null
}

export interface FamilyShareRow {
  companyId: string
  companyName: string
  items: FamilyShareItem[]
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

/** Of `familyIds`, the ones shared with the company (directly or through a partner), in one query. */
export const listFamiliesSharedWith = async (db: DbLike, familyIds: string[], companyId: string): Promise<Set<string>> => {
  if (familyIds.length === 0) return new Set()
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM unnest(ARRAY[${sql.join(
      familyIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}]) AS id WHERE app_family_reaches_company(id, ${companyId}::uuid)`,
  )
  return new Set(rows.map((row) => row.id))
}

const itemValues = {
  productLineId: productFamilyShareItems.productLineId,
  characteristicId: productFamilyShareItems.characteristicId,
  discountPct: productFamilyShareItems.discountPct,
  markupPct: productFamilyShareItems.markupPct,
  installationHours: productFamilyShareItems.installationHoursPerUnit,
}

const toItem = (row: { productLineId: string | null; characteristicId: string | null; discountPct: string; markupPct: string; installationHours: string }): FamilyShareItem => ({
  productLineId: row.productLineId,
  characteristicId: row.characteristicId,
  discountPct: Number(row.discountPct),
  markupPct: Number(row.markupPct),
  installationHours: Number(row.installationHours),
})

/** The items of these shares, by share id. */
const loadShareItems = async (db: DbLike, shareIds: string[]): Promise<Map<string, FamilyShareItem[]>> => {
  const byShare = new Map<string, FamilyShareItem[]>()
  if (shareIds.length === 0) {
    return byShare
  }
  const rows = await db
    .select({ shareId: productFamilyShareItems.shareId, ...itemValues })
    .from(productFamilyShareItems)
    .where(inArray(productFamilyShareItems.shareId, shareIds))
  for (const row of rows) {
    const items = byShare.get(row.shareId) ?? []
    items.push(toItem(row))
    byShare.set(row.shareId, items)
  }
  return byShare
}

/** The shares `fromCompanyId` itself made of this family, with recipient names and each share's items. */
export const listOutgoingFamilyShares = async (
  db: DbLike,
  familyId: string,
  fromCompanyId: string,
): Promise<FamilyShareRow[]> => {
  const rows = await db
    .select({
      id: productFamilyShares.id,
      companyId: productFamilyShares.toCompanyId,
      companyName: companyDirectory.name,
    })
    .from(productFamilyShares)
    .innerJoin(companyDirectory, eq(productFamilyShares.toCompanyId, companyDirectory.id))
    .where(and(eq(productFamilyShares.productFamilyId, familyId), eq(productFamilyShares.fromCompanyId, fromCompanyId)))
    .orderBy(asc(companyDirectory.name))
  const items = await loadShareItems(db, rows.map((row) => row.id))
  return rows.map(({ id, ...row }) => ({ ...row, items: items.get(id) ?? [] }))
}

/** A share item of an older version, by name: an option also by its characteristic's name. */
export interface NamedFamilyShareItem extends FamilyShareItemValues {
  lineName: string | null
  characteristicName: string | null
  optionName: string | null
}

/**
 * For each company `fromCompanyId` shared another version of this family with, the items of the
 * latest such share (most recently saved), by line/option name — so a new version can start from
 * what the company got before. Versions or items the caller can't see are skipped.
 */
export const listPreviousVersionShareItems = async (
  db: DbLike,
  familyId: string,
  fromCompanyId: string,
): Promise<Map<string, NamedFamilyShareItem[]>> => {
  const byCompany = new Map<string, NamedFamilyShareItem[]>()
  const latest = await db
    .selectDistinctOn([productFamilyShares.toCompanyId], { id: productFamilyShares.id, companyId: productFamilyShares.toCompanyId })
    .from(productFamilyShares)
    .where(
      and(
        eq(productFamilyShares.fromCompanyId, fromCompanyId),
        ne(productFamilyShares.productFamilyId, familyId),
        sql`${productFamilyShares.productFamilyId} IN (SELECT app_family_version_chain(${familyId}::uuid))`,
      ),
    )
    .orderBy(productFamilyShares.toCompanyId, desc(productFamilyShares.updatedAt))
  if (latest.length === 0) {
    return byCompany
  }
  const parent = aliasedTable(characteristics, 'parent')
  const rows = await db
    .select({
      shareId: productFamilyShareItems.shareId,
      lineName: productLines.name,
      characteristicName: parent.name,
      optionName: characteristics.name,
      discountPct: productFamilyShareItems.discountPct,
      markupPct: productFamilyShareItems.markupPct,
      installationHours: productFamilyShareItems.installationHoursPerUnit,
    })
    .from(productFamilyShareItems)
    .leftJoin(productLines, eq(productFamilyShareItems.productLineId, productLines.id))
    .leftJoin(characteristics, eq(productFamilyShareItems.characteristicId, characteristics.id))
    .leftJoin(parent, eq(characteristics.parentId, parent.id))
    .where(inArray(productFamilyShareItems.shareId, latest.map((share) => share.id)))
  const companyOf = new Map(latest.map((share) => [share.id, share.companyId]))
  for (const { shareId, ...row } of rows) {
    // A line or option the caller can't see comes back without its name.
    if (!row.lineName && !(row.characteristicName && row.optionName)) continue
    const companyId = companyOf.get(shareId)!
    const items = byCompany.get(companyId) ?? []
    items.push({ ...row, discountPct: Number(row.discountPct), markupPct: Number(row.markupPct), installationHours: Number(row.installationHours) })
    byCompany.set(companyId, items)
  }
  return byCompany
}

/**
 * Companies `sharerCompanyId` can share a family with: active suppliers and
 * clients it is connected to (Partners page). Reads across tenants, so call it
 * from a system transaction; the caller removes the family owner.
 */
export const listFamilyShareTargets = (db: DbLike, sharerCompanyId: string): Promise<FamilyShareTarget[]> =>
  db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(
      and(
        eq(companies.isActive, true),
        or(eq(companies.isSupplier, true), eq(companies.isClient, true)),
        exists(
          db
            .select({ one: sql`1` })
            .from(companyConnections)
            .where(
              and(
                eq(companyConnections.status, 'accepted'),
                or(
                  and(eq(companyConnections.requesterCompanyId, sharerCompanyId), eq(companyConnections.addresseeCompanyId, companies.id)),
                  and(eq(companyConnections.addresseeCompanyId, sharerCompanyId), eq(companyConnections.requesterCompanyId, companies.id)),
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(companies.name))

/** Deletes every share between two companies, in both directions (their connection was removed). Returns how many. */
export const deleteSharesBetween = async (db: DbLike, companyId: string, otherCompanyId: string): Promise<number> => {
  const rows = await db
    .delete(productFamilyShares)
    .where(
      or(
        and(eq(productFamilyShares.fromCompanyId, companyId), eq(productFamilyShares.toCompanyId, otherCompanyId)),
        and(eq(productFamilyShares.fromCompanyId, otherCompanyId), eq(productFamilyShares.toCompanyId, companyId)),
      ),
    )
    .returning({ id: productFamilyShares.id })
  return rows.length
}

/**
 * Replaces the set of shares `fromCompanyId` made of this family: recipients
 * not in `shares` are removed, the rest are added, and each share's items are
 * replaced by the ones given.
 */
export const replaceOutgoingFamilyShares = async (
  db: DbLike,
  familyId: string,
  fromCompanyId: string,
  shares: Array<{ companyId: string; items: FamilyShareItem[] }>,
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
  if (shares.length === 0) {
    return
  }
  const saved = await db
    .insert(productFamilyShares)
    .values(shares.map((share) => ({ productFamilyId: familyId, fromCompanyId, toCompanyId: share.companyId })))
    .onConflictDoUpdate({
      target: [productFamilyShares.productFamilyId, productFamilyShares.fromCompanyId, productFamilyShares.toCompanyId],
      set: { updatedAt: new Date() },
    })
    .returning({ id: productFamilyShares.id, companyId: productFamilyShares.toCompanyId })
  const shareIdOf = new Map(saved.map((row) => [row.companyId, row.id]))
  await db.delete(productFamilyShareItems).where(inArray(productFamilyShareItems.shareId, saved.map((row) => row.id)))
  const items = shares.flatMap((share) =>
    share.items.map((item) => ({
      shareId: shareIdOf.get(share.companyId)!,
      productLineId: item.productLineId,
      characteristicId: item.characteristicId,
      discountPct: item.discountPct.toFixed(4),
      markupPct: item.markupPct.toFixed(4),
      installationHoursPerUnit: item.installationHours.toFixed(4),
    })),
  )
  if (items.length) {
    await db.insert(productFamilyShareItems).values(items)
  }
}

/**
 * Which share of a family with a company applies, when several companies shared it: the owner's,
 * else the first one made. SQL ordering for a query over `product_family_shares`.
 */
const appliedShareFirst = [
  desc(sql`${productFamilyShares.fromCompanyId} = (SELECT pf.supplier_company_id FROM product_families pf WHERE pf.id = ${productFamilyShares.productFamilyId})`),
  asc(productFamilyShares.createdAt),
  asc(productFamilyShares.id),
]

/**
 * What the share of this family with `companyId` gives it, by product line or option id
 * (`null` when the family wasn't shared with it). Only a share from a company that can still
 * reach the family counts — one left behind by a revoked upstream sharer is inert; if several
 * companies shared it, the owner's applies, else the first one made.
 */
export const getIncomingShareItems = async (
  db: DbLike,
  companyId: string,
  familyId: string,
): Promise<Map<string, FamilyShareItemValues> | null> => {
  const [share] = await db
    .select({ id: productFamilyShares.id })
    .from(productFamilyShares)
    .where(
      and(
        eq(productFamilyShares.toCompanyId, companyId),
        eq(productFamilyShares.productFamilyId, familyId),
        sql`app_family_reaches_company(${productFamilyShares.productFamilyId}, ${productFamilyShares.fromCompanyId})`,
      ),
    )
    .orderBy(...appliedShareFirst)
    .limit(1)
  if (!share) {
    return null
  }
  const items = (await loadShareItems(db, [share.id])).get(share.id) ?? []
  return new Map(
    items.map(({ productLineId, characteristicId, ...values }) => [(productLineId ?? characteristicId)!, values]),
  )
}
