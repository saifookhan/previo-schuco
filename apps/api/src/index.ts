import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  calculateQuote,
  generateQuoteReference,
  type QuoteConfiguration,
} from '@schuco/calculation'
import {
  DEMO_PRODUCTS,
  DEMO_QUOTES,
  getProductFamiliesByReference,
  getQuoteByReference,
  type Quote,
} from '@schuco/db'
import { z } from 'zod'

import type { AuthVariables } from './middleware/auth'
import { requireAuth, requireRoles } from './middleware/auth'
import { me } from './routes/me'

const app = new Hono<{ Variables: AuthVariables }>()

/** In-memory quotes created during the session (not persisted). */
const sessionQuotes: Quote[] = []

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())

app.use('*', cors({ origin: corsOrigins, credentials: true }))

app.get('/health', (c) => c.json({ status: 'ok', service: 'schuco-api' }))

app.route('/api/me', me)

const quoteRoles = ['super-admin', 'company-admin', 'super-user', 'user']

app.get('/api/products', requireAuth, requireRoles(quoteRoles), (c) => c.json(DEMO_PRODUCTS))

app.get('/api/quotes/:reference', requireAuth, requireRoles(quoteRoles), (c) => {
  const reference = c.req.param('reference') ?? ''
  const quote = getQuoteByReference(reference) ?? sessionQuotes.find((q) => q.reference === reference)

  if (!quote) {
    return c.json({ error: 'Quote not found' }, 404)
  }

  const families = getProductFamiliesByReference(reference)

  return c.json({ quote, families })
})

app.get('/api/quotes', requireAuth, requireRoles(quoteRoles), (c) => {
  const quotes = [...DEMO_QUOTES, ...sessionQuotes]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20)

  return c.json(quotes)
})

const calculateSchema = z.object({
  productType: z.enum(['window', 'door', 'sliding', 'folding']),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  glazing: z.enum(['double', 'triple', 'acoustic']),
  security: z.enum(['standard', 'enhanced', 'premium']),
  color: z.enum(['white', 'anthracite', 'silver', 'wood']),
  quantity: z.number().int().positive(),
})

app.post('/api/calculate', requireAuth, requireRoles(quoteRoles), async (c) => {
  const body = await c.req.json()
  const parsed = calculateSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  const result = calculateQuote(parsed.data as QuoteConfiguration)
  return c.json(result)
})

const saveQuoteSchema = calculateSchema.extend({
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional(),
  locale: z.enum(['it', 'en', 'de']).default('it'),
})

app.post('/api/quotes', requireAuth, requireRoles(quoteRoles), async (c) => {
  const body = await c.req.json()
  const parsed = saveQuoteSchema.safeParse(body)

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

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`Schuco API running on http://localhost:${port}`)
})

export default app
