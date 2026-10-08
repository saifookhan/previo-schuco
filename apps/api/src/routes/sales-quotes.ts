import type { Context } from 'hono'
import { Hono } from 'hono'

import {
  QuoteValidationError,
  addQuotePosition,
  createQuote,
  duplicatePosition,
  getQuote,
  listMyQuotes,
  previewQuotePosition,
  removeQuotePosition,
  reorderPositions,
  updateQuotePosition,
  type QuoteActor,
} from '../services/quotes-service'
import { renderQuotePdf } from '../lib/quote-pdf'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'

/**
 * Real, catalog-backed sales quotes (not the unrelated legacy in-memory
 * demo at /api/quotes — that route predates the product-family catalog
 * and nothing calls it; kept as-is rather than touched here, out of scope
 * for this change). A quote belongs to the supplier company that creates
 * it, priced against its own product-family catalog.
 */
export const salesQuotes = new Hono<{ Variables: AuthVariables }>()

const EDIT_ROLES = ['company-admin', 'super-user', 'super-admin', 'user'] as const

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
  throw error
}

/** Creates a new draft quote (customer details, no positions yet). */
salesQuotes.post('/', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
  const body = await c.req.json().catch(() => null)
  try {
    const quote = await createQuote(ctxFrom(c), actorFrom(c), body ?? {})
    return c.json({ quote }, 201)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Lists this caller's own quotes. */
salesQuotes.get('/', requireAuth, async (c) => {
  const quoteList = await listMyQuotes(ctxFrom(c))
  return c.json({ quotes: quoteList })
})

/** Full detail: quote header + every position + each position's selected characteristics. */
salesQuotes.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const detail = await getQuote(ctxFrom(c), id)
  if (!detail) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(detail)
})

// Different path depth than '/:id/positions' below (3 segments vs 2), so —
// unlike the PATCH .../reorder vs .../:positionId case — registration
// order here genuinely doesn't matter to Hono's router. Still placed
// first on principle: a static-vs-param ambiguity is a mistake to let
// happen again, not one to rely on being harmless this time.
/** Dry-run pricing for the add/edit position form — same computation, writes nothing. */
salesQuotes.post('/:id/positions/preview', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
  const body = await c.req.json().catch(() => null)
  try {
    const preview = await previewQuotePosition(ctxFrom(c), body ?? {})
    return c.json(preview)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Adds one priced line item to a draft quote (picks a product line + characteristic values, computes the price). */
salesQuotes.post('/:id/positions', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  try {
    const detail = await addQuotePosition(ctxFrom(c), actorFrom(c), id, body ?? {})
    return c.json(detail, 201)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Removes a position from a quote. */
salesQuotes.delete('/:id/positions/:positionId', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
  const id = c.req.param('id')
  const positionId = c.req.param('positionId')
  if (!id || !positionId) {
    return c.json({ error: 'Missing id' }, 400)
  }
  try {
    const detail = await removeQuotePosition(ctxFrom(c), actorFrom(c), id, positionId)
    return c.json(detail)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Reorders a quote's positions (body: { positionIds: string[] }, must list every current position id exactly once). */
salesQuotes.patch('/:id/positions/reorder', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = (await c.req.json().catch(() => null)) as { positionIds?: unknown } | null
  try {
    const detail = await reorderPositions(ctxFrom(c), actorFrom(c), id, (body?.positionIds ?? []) as string[])
    return c.json(detail)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

// IMPORTANT: this generic `:positionId` PATCH must stay registered AFTER
// the static `/reorder` PATCH route above — Hono resolves an ambiguous
// static-vs-param conflict by registration order, not specificity, so
// registering this one first would swallow every `PATCH .../reorder`
// call as `positionId: "reorder"` (confirmed: this exact bug shipped
// once already and silently broke the move-up/move-down buttons).
/** Re-prices an existing position in place (same width/height/qty/characteristic fields as adding one). */
salesQuotes.patch('/:id/positions/:positionId', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
  const id = c.req.param('id')
  const positionId = c.req.param('positionId')
  if (!id || !positionId) {
    return c.json({ error: 'Missing id' }, 400)
  }
  if (positionId === 'reorder') {
    return c.json({ error: 'Not found' }, 404)
  }
  const body = await c.req.json().catch(() => null)
  try {
    const detail = await updateQuotePosition(ctxFrom(c), actorFrom(c), id, positionId, body ?? {})
    return c.json(detail)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Duplicates a position as a new one appended to the end of the quote. */
salesQuotes.post('/:id/positions/:positionId/duplicate', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
  const id = c.req.param('id')
  const positionId = c.req.param('positionId')
  if (!id || !positionId) {
    return c.json({ error: 'Missing id' }, 400)
  }
  try {
    const detail = await duplicatePosition(ctxFrom(c), actorFrom(c), id, positionId)
    return c.json(detail, 201)
  } catch (error) {
    return quoteErrorResponse(c, error)
  }
})

/** Streams the quote as a PDF document. */
salesQuotes.get('/:id/pdf', requireAuth, async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const detail = await getQuote(ctxFrom(c), id)
  if (!detail) {
    return c.json({ error: 'Not found' }, 404)
  }

  // The reference is free text (only checked non-empty at creation) — strip
  // anything that could break the header (quotes, CR/LF, backslashes) rather
  // than trust it verbatim in a Content-Disposition value.
  const safeFilename = detail.quote.reference.replace(/[^a-zA-Z0-9 ._-]/g, '_') || 'quote'

  const pdfBuffer = await renderQuotePdf(detail)
  return c.body(new Uint8Array(pdfBuffer), 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${safeFilename}.pdf"`,
    'Cache-Control': 'private, no-store',
  })
})
