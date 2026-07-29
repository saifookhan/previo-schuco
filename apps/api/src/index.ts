import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  calculateQuote,
  generateQuoteReference,
  type QuoteConfiguration,
} from '@schuco/calculation'
import { createDb, schema } from '@schuco/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

const app = new Hono()
const db = createDb(process.env.DATABASE_URL ?? '../../packages/db/schuco.db')

app.use('*', cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }))

app.get('/health', (c) => c.json({ status: 'ok', service: 'schuco-api' }))

app.get('/api/products', async (c) => {
  const products = await db.select().from(schema.products)
  return c.json(products)
})

app.get('/api/quotes/:reference', async (c) => {
  const reference = c.req.param('reference')
  const [quote] = await db
    .select()
    .from(schema.quotes)
    .where(eq(schema.quotes.reference, reference))
    .limit(1)

  if (!quote) {
    return c.json({ error: 'Quote not found' }, 404)
  }

  return c.json(quote)
})

app.get('/api/quotes', async (c) => {
  const quotes = await db
    .select()
    .from(schema.quotes)
    .orderBy(desc(schema.quotes.createdAt))
    .limit(20)

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

app.post('/api/calculate', async (c) => {
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

app.post('/api/quotes', async (c) => {
  const body = await c.req.json()
  const parsed = saveQuoteSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400)
  }

  const result = calculateQuote(parsed.data as QuoteConfiguration)
  const reference = generateQuoteReference()

  const [quote] = await db
    .insert(schema.quotes)
    .values({
      reference,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
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
    })
    .returning()

  return c.json({ quote, calculation: result })
})

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`Schuco API running on http://localhost:${port}`)
})

export default app
