import type { Context } from 'hono'
import { Hono } from 'hono'

import {
  createQuoteAlternativeRequestSchema,
  createSalesQuoteRequestSchema,
  duplicateSalesQuoteRequestSchema,
  priceLinesRequestSchema,
  quoteStatusSchema,
  saveQuoteRequestSchema,
  setArchivedRequestSchema,
  setFavoriteRequestSchema,
  setQuoteStatusRequestSchema,
  setQuoteVariantLabelRequestSchema,
} from '@schuco/contracts'

import {
  QuoteConflictError,
  QuoteForbiddenError,
  QuoteValidationError,
  createQuote,
  createQuoteAlternative,
  duplicateQuoteVariant,
  getQuote,
  getQuoteHistory,
  getQuotePrintData,
  getQuoteRevisionDetail,
  getQuoteRevisions,
  listMyQuotes,
  priceQuoteLines,
  promoteQuoteVariant,
  saveQuoteVersion,
  setQuoteArchived,
  setQuoteVariantFavorite,
  setQuoteVariantFinal,
  setQuoteVariantLabelById,
  setQuoteVersionStatusById,
  type QuoteActor,
} from '../services/quotes-service'
import { rejectNonUuidParams } from '../lib/uuid'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission, requireRoles } from '../middleware/auth'
import { respondWithRecordHistory } from './record-history'

/**
 * Real, catalog-backed sales quotes (not the unrelated legacy in-memory
 * demo at /api/quotes — that route predates the product-family catalog
 * and nothing calls it; kept as-is rather than touched here, out of scope
 * for this change). A quote belongs to the supplier company that creates
 * it; each of its versions is one document (header, intro, product
 * families with their lines, closing, print settings) saved as a whole.
 */
export const salesQuotes = new Hono<{ Variables: AuthVariables }>()

const actorFrom = (c: Context<{ Variables: AuthVariables }>): QuoteActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

const ctxFrom = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

const quoteErrorResponse = (c: Context<{ Variables: AuthVariables }>, error: unknown) => {
  if (error instanceof QuoteValidationError) {
    return c.json({ error: error.message }, 400)
  }
  if (error instanceof QuoteConflictError) {
    return c.json({ error: error.message }, 409)
  }
  if (error instanceof QuoteForbiddenError) {
    return c.json({ error: error.message }, 403)
  }
  throw error
}

/** `?version=N` or `?alternative=M`: a whole number from 1, undefined when omitted, null when it isn't. */
const positiveQuery = (c: Context, name: string): number | undefined | null => {
  const raw = c.req.query(name)
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  return Number.isInteger(value) && value >= 1 ? value : null
}

/** Creates a new draft quote with an empty first version. */
salesQuotes.post('/', requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = createSalesQuoteRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  }
  try {
    return c.json(await createQuote(ctxFrom(c), actorFrom(c), parsed.data), 201)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Lists this caller's own quotes. Archived ones are left out unless `includeArchived=1`. */
salesQuotes.get('/', requireAuth, requirePermission('quote.view'), async (c) => {
  const statusRaw = c.req.query('status')
  const status = statusRaw ? quoteStatusSchema.safeParse(statusRaw) : null
  if (status && !status.success) {
    return c.json({ error: 'Invalid status' }, 400)
  }
  const includeRaw = c.req.query('includeArchived')
  return c.json({
    quotes: await listMyQuotes(ctxFrom(c), {
      q: c.req.query('q'),
      status: status?.success ? status.data : undefined,
      includeArchived: includeRaw === '1' || includeRaw === 'true',
      favorites: c.req.query('favorites') === '1' || c.req.query('favorites') === 'true',
    }),
  })
})

/**
 * The catalog €/pz of each line — the builder's live prices, the same a save stores. Static
 * path, registered before the `/:id` routes.
 */
salesQuotes.post('/price-lines', requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = priceLinesRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  }
  return c.json({ lines: await priceQuoteLines(ctxFrom(c), parsed.data) })
})

/** A quote with one variant (`?version=N&alternative=M`, default the latest version's A1). */
salesQuotes.get('/:id', rejectNonUuidParams, requireAuth, requirePermission('quote.view'), async (c) => {
  const version = positiveQuery(c, 'version')
  const alternative = positiveQuery(c, 'alternative')
  if (version === null || alternative === null) {
    return c.json({ error: 'Invalid version' }, 400)
  }
  const detail = await getQuote(ctxFrom(c), c.req.param('id')!, version, alternative)
  return detail ? c.json(detail) : c.json({ error: 'Not found' }, 404)
})

/** Everything the printed quote shows (`?version=N`, default the latest): the version, the company, its branch and the sales contact. */
salesQuotes.get('/:id/print', rejectNonUuidParams, requireAuth, requirePermission('quote.view'), async (c) => {
  const version = positiveQuery(c, 'version')
  const alternative = positiveQuery(c, 'alternative')
  if (version === null || alternative === null) {
    return c.json({ error: 'Invalid version' }, 400)
  }
  const data = await getQuotePrintData(ctxFrom(c), c.req.param('id')!, version, alternative)
  return data ? c.json(data) : c.json({ error: 'Not found' }, 404)
})

/** Soft-deletes or restores the quote. Company admins and super admins only. */
salesQuotes.post('/:id/archive', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), requireRoles(['company-admin', 'super-admin']), async (c) => {
  const parsed = setArchivedRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  try {
    return c.json(await setQuoteArchived(ctxFrom(c), actorFrom(c), c.req.param('id')!, parsed.data.archived))
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** A new quote whose V1A1 is a copy of one variant. */
salesQuotes.post('/:id/duplicate', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = duplicateSalesQuoteRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  try {
    return c.json(await duplicateQuoteVariant(ctxFrom(c), actorFrom(c), c.req.param('id')!, parsed.data), 201)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** The quote's audit history (created, saved, new versions, status changes) — for anyone who can see the quote. */
salesQuotes.get('/:id/history', rejectNonUuidParams, requireAuth, requirePermission('quote.view'), (c) =>
  respondWithRecordHistory(c, (id, query) => getQuoteHistory(ctxFrom(c), id, query)),
)

/** Saves a version: fixed in place (`mode: 'update'`, drafts only) or as the quote's next version (`mode: 'newVersion'`). */
salesQuotes.put('/:id/versions/:versionId', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = saveQuoteRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  }
  try {
    return c.json(await saveQuoteVersion(ctxFrom(c), actorFrom(c), c.req.param('id')!, c.req.param('versionId')!, parsed.data))
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Copies this variant to the next version, same alternative (V1A2 → V2A2). */
salesQuotes.post('/:id/versions/:versionId/promote', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  try {
    return c.json(await promoteQuoteVariant(ctxFrom(c), actorFrom(c), c.req.param('id')!, c.req.param('versionId')!), 201)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Copies the submitted document as the next alternative on this version (V1A2 → V1A3). */
salesQuotes.post('/:id/versions/:versionId/alternatives', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = createQuoteAlternativeRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  try {
    return c.json(await createQuoteAlternative(ctxFrom(c), actorFrom(c), c.req.param('id')!, c.req.param('versionId')!, parsed.data), 201)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Renames the variant. Does not change its document. */
salesQuotes.patch('/:id/versions/:versionId/label', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = setQuoteVariantLabelRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  try {
    return c.json(await setQuoteVariantLabelById(ctxFrom(c), actorFrom(c), c.req.param('id')!, c.req.param('versionId')!, parsed.data))
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Marks or clears a favorite on this variant. Any number of a quote's variants can be favorites. */
salesQuotes.post('/:id/versions/:versionId/favorite', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = setFavoriteRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  try {
    return c.json(
      await setQuoteVariantFavorite(ctxFrom(c), actorFrom(c), c.req.param('id')!, c.req.param('versionId')!, parsed.data.favorite),
    )
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Marks this variant as the quote's final offer, the one the dashboard uses. */
salesQuotes.post('/:id/versions/:versionId/final', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  try {
    return c.json(await setQuoteVariantFinal(ctxFrom(c), actorFrom(c), c.req.param('id')!, c.req.param('versionId')!))
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Marks a variant draft, invoiced or accepted. */
salesQuotes.post('/:id/versions/:versionId/status', rejectNonUuidParams, requireAuth, requirePermission('quote.edit'), async (c) => {
  const parsed = setQuoteStatusRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', issues: parsed.error.issues }, 400)
  }
  try {
    return c.json(
      await setQuoteVersionStatusById(ctxFrom(c), actorFrom(c), c.req.param('id')!, c.req.param('versionId')!, parsed.data.status),
    )
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Every save of a version, newest first, with what changed in each. */
salesQuotes.get('/:id/versions/:versionId/revisions', rejectNonUuidParams, requireAuth, requirePermission('quote.view'), async (c) => {
  const revisions = await getQuoteRevisions(ctxFrom(c), c.req.param('id')!, c.req.param('versionId')!)
  return revisions ? c.json({ revisions }) : c.json({ error: 'Not found' }, 404)
})

/** One past save of a version, with the document as it was then. */
salesQuotes.get(
  '/:id/versions/:versionId/revisions/:revision',
  rejectNonUuidParams,
  requireAuth,
  requirePermission('quote.view'),
  async (c) => {
    const revision = Number(c.req.param('revision')!)
    if (!Number.isInteger(revision) || revision < 1) {
      return c.json({ error: 'Not found' }, 404)
    }
    const detail = await getQuoteRevisionDetail(ctxFrom(c), c.req.param('id')!, c.req.param('versionId')!, revision)
    return detail ? c.json(detail) : c.json({ error: 'Not found' }, 404)
  },
)
