import type { Context } from 'hono'
import { Hono } from 'hono'

import {
  createSalesQuoteRequestSchema,
  priceLinesRequestSchema,
  saveQuoteRequestSchema,
  setQuoteStatusRequestSchema,
} from '@schuco/contracts'

import {
  QuoteConflictError,
  QuoteValidationError,
  createQuote,
  getQuote,
  getQuoteHistory,
  getQuotePrintData,
  getQuoteRevisionDetail,
  getQuoteRevisions,
  listMyQuotes,
  priceQuoteLines,
  saveQuoteVersion,
  setQuoteVersionStatusById,
  type QuoteActor,
} from '../services/quotes-service'
import { rejectNonUuidParams } from '../lib/uuid'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
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
  throw error
}

/** `?version=N`: a whole number from 1, or undefined for the latest; null when it is something else. */
const versionQuery = (c: Context): number | undefined | null => {
  const raw = c.req.query('version')
  if (raw === undefined) return undefined
  const version = Number(raw)
  return Number.isInteger(version) && version >= 1 ? version : null
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

/** Lists this caller's own quotes. */
salesQuotes.get('/', requireAuth, requirePermission('quote.view'), async (c) => {
  return c.json({ quotes: await listMyQuotes(ctxFrom(c)) })
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

/** A quote with one of its versions (`?version=N`, default the latest), and whether each catalog family on it can still price it. */
salesQuotes.get('/:id', rejectNonUuidParams, requireAuth, requirePermission('quote.view'), async (c) => {
  const version = versionQuery(c)
  if (version === null) {
    return c.json({ error: 'Invalid version' }, 400)
  }
  const detail = await getQuote(ctxFrom(c), c.req.param('id')!, version)
  return detail ? c.json(detail) : c.json({ error: 'Not found' }, 404)
})

/** Everything the printed quote shows (`?version=N`, default the latest): the version, the company, its branch and the sales contact. */
salesQuotes.get('/:id/print', rejectNonUuidParams, requireAuth, requirePermission('quote.view'), async (c) => {
  const version = versionQuery(c)
  if (version === null) {
    return c.json({ error: 'Invalid version' }, 400)
  }
  const data = await getQuotePrintData(ctxFrom(c), c.req.param('id')!, version)
  return data ? c.json(data) : c.json({ error: 'Not found' }, 404)
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

/** Marks a version sent, accepted or rejected. */
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
