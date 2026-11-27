import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm'

import type { DbLike } from '../client'
import { auditLog, productFamilies, quoteVersions, quotes, users } from '../schema'
import type { QuoteRow } from './quotes'

export interface DashboardQuoteRow extends QuoteRow {
  sentAt: Date | null
  createdByName: string | null
  /** Latest version document when the quote is sent or accepted; null for drafts and rejected. */
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
 * Every quote of `companyId`, with the creator's name, the latest version's
 * `sent_at`, and that version's document when the quote is sent or accepted.
 * Explicit company filter, same reason as `listQuotes`: a super-admin's RLS
 * policy would otherwise see every tenant.
 */
export const listDashboardQuotes = (db: DbLike, companyId: string, createdByUserId: string | null): Promise<DashboardQuoteRow[]> => {
  const filters = [eq(quotes.supplierCompanyId, companyId)]
  if (createdByUserId) filters.push(eq(quotes.createdByUserId, createdByUserId))
  return db
    .select({
      ...getTableColumns(quotes),
      sentAt: quoteVersions.sentAt,
      createdByName: users.name,
      document: sql<unknown>`case when ${quotes.status} in ('sent', 'accepted') then ${quoteVersions.document} else null end`,
    })
    .from(quotes)
    .leftJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.latestVersion)))
    .leftJoin(users, eq(users.id, quotes.createdByUserId))
    .where(and(...filters))
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
