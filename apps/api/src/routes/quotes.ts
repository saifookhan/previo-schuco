import { calculateQuote, generateQuoteReference } from '@schuco/calculation'
import { createQuoteRequestSchema, type QuoteConfiguration } from '@schuco/contracts'
import {
  DEMO_QUOTES,
  getProductFamiliesByReference,
  getQuoteByReference,
  type Quote,
} from '@schuco/db'
import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'

const quoteRoles = ['super-admin', 'company-admin', 'super-user', 'user']

/** In-memory quotes created during the session (not persisted). */
const sessionQuotes: Quote[] = []

/** Quote listing, detail, and creation. */
export const quotes = new Hono<{ Variables: AuthVariables }>()

quotes.get('/', requireAuth, requireRoles(quoteRoles), (c) => {
  const items = [...DEMO_QUOTES, ...sessionQuotes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)

  return c.json(items)
})

quotes.get('/:reference', requireAuth, requireRoles(quoteRoles), (c) => {
  const reference = c.req.param('reference') ?? ''
  const quote = getQuoteByReference(reference) ?? sessionQuotes.find((q) => q.reference === reference)

  if (!quote) {
    return c.json({ error: 'Quote not found' }, 404)
  }

  const families = getProductFamiliesByReference(reference)

  return c.json({ quote, families })
})

quotes.post('/', requireAuth, requireRoles(quoteRoles), async (c) => {
  const body: unknown = await c.req.json()
  const parsed = createQuoteRequestSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  const result = calculateQuote(parsed.data as QuoteConfiguration)
  const reference = generateQuoteReference()

  const quote: Quote = {
    id: DEMO_QUOTES.length + sessionQuotes.length + 1,
    reference,
    customerName: parsed.data.customerName,
    customerEmail: parsed.data.customerEmail ?? null,
    productType: parsed.data.productType,
    widthMm: parsed.data.widthMm,
    heightMm: parsed.data.heightMm,
    glazing: parsed.data.glazing,
    security: parsed.data.security,
    color: parsed.data.color,
    quantity: parsed.data.quantity,
    subtotal: result.subtotal,
    vatAmount: result.vatAmount,
    total: result.total,
    locale: parsed.data.locale,
    createdAt: new Date().toISOString(),
  }

  sessionQuotes.push(quote)

  return c.json({ quote, calculation: result })
})
