import { aliasedTable, and, asc, desc, eq, getTableColumns } from 'drizzle-orm'

import type { DbLike } from '../client'
import { quoteRevisions, quoteTextTemplates, quoteVersions, quotes, users } from '../schema'

export type QuoteRow = typeof quotes.$inferSelect
export type QuoteStatusValue = QuoteRow['status']

export interface InsertQuoteInput {
  supplierCompanyId: string
  createdByUserId: string | null
  reference: string
  customerName: string
  projectLocation: string | null
  totalPrice: string
}

export const insertQuote = async (db: DbLike, input: InsertQuoteInput): Promise<string> => {
  const [row] = await db.insert(quotes).values(input).returning({ id: quotes.id })
  return row.id
}

/**
 * Lists quotes for `companyId`, most recent first. Explicit filter, not
 * RLS alone — `app_is_super_admin()` makes `quotes_tenant`'s
 * `supplier_company_id = app_current_company_id()` a no-op for a
 * super-admin, including one acting as a specific tenant via
 * `X-Tenant-Id` (ADR 0006 / 0008; same reasoning as `listUsers`).
 */
export const listQuotes = (db: DbLike, companyId: string): Promise<QuoteRow[]> =>
  db.select().from(quotes).where(eq(quotes.supplierCompanyId, companyId)).orderBy(desc(quotes.createdAt))

/**
 * The quotes list, with the latest version's `sent_at`. Same company filter and
 * newest-first order as {@link listQuotes}.
 */
export const listQuoteSummaries = (
  db: DbLike,
  companyId: string,
): Promise<Array<QuoteRow & { sentAt: Date | null }>> =>
  db
    .select({
      ...getTableColumns(quotes),
      sentAt: quoteVersions.sentAt,
    })
    .from(quotes)
    .leftJoin(quoteVersions, and(eq(quoteVersions.quoteId, quotes.id), eq(quoteVersions.version, quotes.latestVersion)))
    .where(eq(quotes.supplierCompanyId, companyId))
    .orderBy(desc(quotes.createdAt))

/** One quote (RLS-scoped), or null. */
export const getQuoteRow = async (db: DbLike, quoteId: string): Promise<QuoteRow | null> => {
  const [row] = await db.select().from(quotes).where(eq(quotes.id, quoteId))
  return row ?? null
}

/** Whether the quote exists and is visible to the caller (RLS). */
export const quoteExists = async (db: DbLike, quoteId: string): Promise<boolean> =>
  (await getQuoteRow(db, quoteId)) !== null

/** Locks the quote row until the transaction ends, so two saves of it (e.g. two new versions) run one after the other. */
export const lockQuote = async (db: DbLike, quoteId: string): Promise<QuoteRow | null> => {
  const [row] = await db.select().from(quotes).where(eq(quotes.id, quoteId)).for('update')
  return row ?? null
}

/** Mirrors the latest version onto the quote, for the list. */
export const updateQuoteSummary = async (
  db: DbLike,
  quoteId: string,
  input: Pick<QuoteRow, 'status' | 'customerName' | 'projectLocation' | 'totalPrice' | 'latestVersion'>,
): Promise<void> => {
  await db
    .update(quotes)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(quotes.id, quoteId))
}

export type QuoteVersionRow = typeof quoteVersions.$inferSelect

export interface QuoteVersionWithUsers extends QuoteVersionRow {
  createdByName: string | null
  updatedByName: string | null
}

const createdByUser = aliasedTable(users, 'created_by_user')
const updatedByUser = aliasedTable(users, 'updated_by_user')

/** A quote's versions, oldest first (without their documents). */
export const listQuoteVersions = (
  db: DbLike,
  quoteId: string,
): Promise<Pick<QuoteVersionRow, 'id' | 'version' | 'status' | 'totalPrice' | 'updatedAt'>[]> =>
  db
    .select({
      id: quoteVersions.id,
      version: quoteVersions.version,
      status: quoteVersions.status,
      totalPrice: quoteVersions.totalPrice,
      updatedAt: quoteVersions.updatedAt,
    })
    .from(quoteVersions)
    .where(eq(quoteVersions.quoteId, quoteId))
    .orderBy(asc(quoteVersions.version))

/** One version of a quote by number, with who created and last saved it; null if there is none. */
export const getQuoteVersion = async (
  db: DbLike,
  quoteId: string,
  version: number,
): Promise<QuoteVersionWithUsers | null> => {
  const [row] = await db
    .select({ version: quoteVersions, createdByName: createdByUser.name, updatedByName: updatedByUser.name })
    .from(quoteVersions)
    .leftJoin(createdByUser, eq(createdByUser.id, quoteVersions.createdByUserId))
    .leftJoin(updatedByUser, eq(updatedByUser.id, quoteVersions.updatedByUserId))
    .where(and(eq(quoteVersions.quoteId, quoteId), eq(quoteVersions.version, version)))
  return row ? { ...row.version, createdByName: row.createdByName, updatedByName: row.updatedByName } : null
}

/** One version of a quote by id (scoped to the quote in the WHERE), or null. */
export const getQuoteVersionById = async (db: DbLike, quoteId: string, versionId: string): Promise<QuoteVersionRow | null> => {
  const [row] = await db
    .select()
    .from(quoteVersions)
    .where(and(eq(quoteVersions.quoteId, quoteId), eq(quoteVersions.id, versionId)))
  return row ?? null
}

export interface InsertQuoteVersionInput {
  quoteId: string
  version: number
  status: QuoteStatusValue
  document: Record<string, unknown>
  totalPrice: string
  createdByUserId: string | null
}

export const insertQuoteVersion = async (db: DbLike, input: InsertQuoteVersionInput): Promise<QuoteVersionRow> => {
  const [row] = await db
    .insert(quoteVersions)
    .values({ ...input, revision: 1, updatedByUserId: input.createdByUserId })
    .returning()
  return row
}

/** Saves a version's document as its next revision; only when it is still at `baseRevision`. Returns false otherwise. */
export const updateQuoteVersionDocument = async (
  db: DbLike,
  versionId: string,
  baseRevision: number,
  input: { document: Record<string, unknown>; totalPrice: string; updatedByUserId: string | null },
): Promise<boolean> => {
  const rows = await db
    .update(quoteVersions)
    .set({ ...input, revision: baseRevision + 1, updatedAt: new Date() })
    .where(and(eq(quoteVersions.id, versionId), eq(quoteVersions.revision, baseRevision)))
    .returning({ id: quoteVersions.id })
  return rows.length > 0
}

export const setQuoteVersionStatus = async (
  db: DbLike,
  versionId: string,
  input: { status: QuoteStatusValue; sentAt: Date | null; updatedByUserId: string | null },
): Promise<void> => {
  await db
    .update(quoteVersions)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(quoteVersions.id, versionId))
}

export type QuoteRevisionRow = typeof quoteRevisions.$inferSelect

export const insertQuoteRevision = async (
  db: DbLike,
  input: Pick<QuoteRevisionRow, 'quoteVersionId' | 'revision' | 'document' | 'totalPrice' | 'changes' | 'fromVersion' | 'savedByUserId'>,
): Promise<void> => {
  await db.insert(quoteRevisions).values(input)
}

export type QuoteRevisionListRow = Omit<QuoteRevisionRow, 'document'> & { savedByName: string | null }

/** Every save of a version, newest first, without the documents. */
export const listQuoteRevisions = async (db: DbLike, quoteVersionId: string): Promise<QuoteRevisionListRow[]> => {
  const rows = await db
    .select({
      id: quoteRevisions.id,
      quoteVersionId: quoteRevisions.quoteVersionId,
      revision: quoteRevisions.revision,
      totalPrice: quoteRevisions.totalPrice,
      changes: quoteRevisions.changes,
      fromVersion: quoteRevisions.fromVersion,
      savedByUserId: quoteRevisions.savedByUserId,
      savedAt: quoteRevisions.savedAt,
      savedByName: users.name,
    })
    .from(quoteRevisions)
    .leftJoin(users, eq(users.id, quoteRevisions.savedByUserId))
    .where(eq(quoteRevisions.quoteVersionId, quoteVersionId))
    .orderBy(desc(quoteRevisions.revision))
  return rows
}

/** One save of a version, with its document; null if there is none. */
export const getQuoteRevision = async (
  db: DbLike,
  quoteVersionId: string,
  revision: number,
): Promise<(QuoteRevisionRow & { savedByName: string | null }) | null> => {
  const [row] = await db
    .select({ revision: quoteRevisions, savedByName: users.name })
    .from(quoteRevisions)
    .leftJoin(users, eq(users.id, quoteRevisions.savedByUserId))
    .where(and(eq(quoteRevisions.quoteVersionId, quoteVersionId), eq(quoteRevisions.revision, revision)))
  return row ? { ...row.revision, savedByName: row.savedByName } : null
}

export type QuoteTextTemplateRow = typeof quoteTextTemplates.$inferSelect

/** A company's saved texts, by name. Explicit company filter, as in `listQuotes`. */
export const listQuoteTextTemplates = (db: DbLike, companyId: string): Promise<QuoteTextTemplateRow[]> =>
  db.select().from(quoteTextTemplates).where(eq(quoteTextTemplates.companyId, companyId)).orderBy(asc(quoteTextTemplates.name))

export const insertQuoteTextTemplate = async (
  db: DbLike,
  input: { companyId: string; name: string; html: string },
): Promise<QuoteTextTemplateRow> => {
  const [row] = await db.insert(quoteTextTemplates).values(input).returning()
  return row
}

/** Updates one of the company's saved texts; null if it has no such text. */
export const updateQuoteTextTemplate = async (
  db: DbLike,
  companyId: string,
  id: string,
  input: { name: string; html: string },
): Promise<QuoteTextTemplateRow | null> => {
  const [row] = await db
    .update(quoteTextTemplates)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(quoteTextTemplates.id, id), eq(quoteTextTemplates.companyId, companyId)))
    .returning()
  return row ?? null
}

/** Deletes one of the company's saved texts; false if it has no such text. */
export const deleteQuoteTextTemplate = async (db: DbLike, companyId: string, id: string): Promise<boolean> => {
  const rows = await db
    .delete(quoteTextTemplates)
    .where(and(eq(quoteTextTemplates.id, id), eq(quoteTextTemplates.companyId, companyId)))
    .returning({ id: quoteTextTemplates.id })
  return rows.length > 0
}
