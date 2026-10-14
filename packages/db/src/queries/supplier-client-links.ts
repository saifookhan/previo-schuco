import { and, asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { DbLike } from '../client'
import { companies, supplierClientLinks } from '../schema'

export interface CatalogLinkRow {
  manufacturerCompanyId: string
  manufacturerName: string
  partnerCompanyId: string
  partnerName: string
  createdAt: Date
}

/** Every manufacturer → partner (supplier or client) catalog link, with both company names. RLS-scoped: a non-super-admin only sees links it is part of. */
export const listCatalogLinks = async (db: DbLike): Promise<CatalogLinkRow[]> => {
  const partner = alias(companies, 'partner')
  return db
    .select({
      manufacturerCompanyId: supplierClientLinks.supplierCompanyId,
      manufacturerName: companies.name,
      partnerCompanyId: supplierClientLinks.clientCompanyId,
      partnerName: partner.name,
      createdAt: supplierClientLinks.createdAt,
    })
    .from(supplierClientLinks)
    .innerJoin(companies, eq(supplierClientLinks.supplierCompanyId, companies.id))
    .innerJoin(partner, eq(supplierClientLinks.clientCompanyId, partner.id))
    .orderBy(asc(companies.name), asc(partner.name))
}

/** Adds a link. Returns whether a new row was created — a repeat of an existing pair is a no-op returning false. */
export const insertCatalogLink = async (
  db: DbLike,
  manufacturerCompanyId: string,
  partnerCompanyId: string,
): Promise<boolean> => {
  const rows = await db
    .insert(supplierClientLinks)
    .values({ supplierCompanyId: manufacturerCompanyId, clientCompanyId: partnerCompanyId })
    .onConflictDoNothing()
    .returning({ id: supplierClientLinks.supplierCompanyId })
  return rows.length > 0
}

/** Removes a link. Returns whether a row existed. */
export const deleteCatalogLink = async (
  db: DbLike,
  manufacturerCompanyId: string,
  partnerCompanyId: string,
): Promise<boolean> => {
  const rows = await db
    .delete(supplierClientLinks)
    .where(
      and(
        eq(supplierClientLinks.supplierCompanyId, manufacturerCompanyId),
        eq(supplierClientLinks.clientCompanyId, partnerCompanyId),
      ),
    )
    .returning({ id: supplierClientLinks.supplierCompanyId })
  return rows.length > 0
}

/** Whether `manufacturerCompanyId` has shared its catalog with `partnerCompanyId`. */
export const isCatalogLinked = async (
  db: DbLike,
  manufacturerCompanyId: string,
  partnerCompanyId: string,
): Promise<boolean> => {
  const rows = await db
    .select({ id: supplierClientLinks.supplierCompanyId })
    .from(supplierClientLinks)
    .where(
      and(
        eq(supplierClientLinks.supplierCompanyId, manufacturerCompanyId),
        eq(supplierClientLinks.clientCompanyId, partnerCompanyId),
      ),
    )
    .limit(1)
  return rows.length > 0
}
