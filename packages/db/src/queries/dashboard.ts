import { and, asc, eq, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import { auditLog, productFamilies, quoteVersions, quotes, users } from '../schema'
import type { QuoteStatusValue } from './quotes'

export interface DashboardVariantRow {
  quoteId: string
  reference: string
  customerName: string
  projectLocation: string | null
  createdAt: Date
  createdByUserId: string | null
  createdByName: string | null
  version: number
  alternative: number
  isFinal: boolean
  status: QuoteStatusValue
  totalPrice: string
  updatedAt: Date
  sentAt: Date | null
  /** Document when this variant is sent or accepted; null otherwise. */
  document: unknown
}

export interface DashboardStatusEventRow {
  quoteId: string
  at: Date
  to: string
}

export interface DashboardFamilyHealthRow {
  id: string
  name: string
  category: string | null
  brand: string | null
  isPublished: boolean
  readyForInvoicing: boolean
  priceValidTo: string | null
}

/**
 * Every variant (VxAy) of every quote of `companyId`. The dashboard keeps one
 * per quote — the final/favorite, or otherwise the highest version and alternative —
 * so this returns the whole grid and the caller picks. Explicit company filter,
 * same reason as `listQuotes`.
 */
export const listDashboardQuotes = (db: DbLike, companyId: string, createdByUserId: string | null): Promise<DashboardVariantRow[]> => {
  const filters = [eq(quotes.supplierCompanyId, companyId)]
  if (createdByUserId) filters.push(eq(quotes.createdByUserId, createdByUserId))
  return db
    .select({
      quoteId: quotes.id,
      reference: quotes.reference,
      customerName: quotes.customerName,
      projectLocation: quotes.projectLocation,
      createdAt: quotes.createdAt,
      createdByUserId: quotes.createdByUserId,
      createdByName: users.name,
      version: quoteVersions.version,
      alternative: quoteVersions.alternative,
      isFinal: quoteVersions.isFinal,
      status: quoteVersions.status,
      totalPrice: quoteVersions.totalPrice,
      updatedAt: quoteVersions.updatedAt,
      sentAt: quoteVersions.sentAt,
      document: sql<unknown>`case when ${quoteVersions.status} in ('sent', 'accepted') then ${quoteVersions.document} else null end`,
    })
    .from(quotes)
    .innerJoin(quoteVersions, eq(quoteVersions.quoteId, quotes.id))
    .leftJoin(users, eq(users.id, quotes.createdByUserId))
    .where(and(...filters))
    .orderBy(asc(quotes.createdAt), asc(quoteVersions.version), asc(quoteVersions.alternative))
}

/**
 * `quote.set_status` audit rows for the company, oldest first.
 * `metadata.to` is the status the quote was moved to.
 */
export const listDashboardStatusEvents = async (db: DbLike, companyId: string): Promise<DashboardStatusEventRow[]> => {
  const rows = await db
    .select({
      quoteId: auditLog.resourceId,
      at: auditLog.createdAt,
      metadata: auditLog.metadata,
    })
    .from(auditLog)
    .where(and(eq(auditLog.effectiveCompanyId, companyId), eq(auditLog.action, 'quote.set_status'), eq(auditLog.resourceType, 'quote')))
    .orderBy(asc(auditLog.createdAt))

  const events: DashboardStatusEventRow[] = []
  for (const row of rows) {
    if (!row.quoteId) continue
    const to = (row.metadata as { to?: unknown } | null)?.to
    if (typeof to !== 'string') continue
    events.push({ quoteId: row.quoteId, at: row.at, to })
  }
  return events
}

/** Families the company owns, for the price-list health lists. */
export const listDashboardFamilies = (db: DbLike, companyId: string): Promise<DashboardFamilyHealthRow[]> =>
  db
    .select({
      id: productFamilies.id,
      name: productFamilies.name,
      category: productFamilies.category,
      brand: productFamilies.brand,
      isPublished: productFamilies.isPublished,
      readyForInvoicing: productFamilies.readyForInvoicing,
      priceValidTo: productFamilies.priceValidTo,
    })
    .from(productFamilies)
    .where(eq(productFamilies.supplierCompanyId, companyId))
