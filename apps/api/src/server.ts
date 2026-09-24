import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import type { AuthVariables } from './middleware/auth'
import { adminInvites } from './routes/admin/invites'
import { adminUsers } from './routes/admin/users'
import { calculate } from './routes/calculate'
import { createDocsRoutes } from './routes/docs'
import { health } from './routes/health'
import { me } from './routes/me'
import { productFamilies } from './routes/product-families'
import { products } from './routes/products'
import { quotes } from './routes/quotes'
import { salesQuotes } from './routes/sales-quotes'
import { users } from './routes/users'

const app = new Hono<{ Variables: AuthVariables }>()

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())

const port = Number(process.env.PORT ?? 3001)
const apiPublicUrl = process.env.API_PUBLIC_URL ?? `http://localhost:${port}`

app.use('*', cors({ origin: corsOrigins, credentials: true }))

app.route('/health', health)
app.route('/api/me', me)
app.route('/api/users', users)
app.route('/api/admin/users', adminUsers)
app.route('/api/admin/invites', adminInvites)
app.route('/api/products', products)
app.route('/api/product-families', productFamilies)
app.route('/api/quotes', quotes)
app.route('/api/sales-quotes', salesQuotes)
app.route('/api/calculate', calculate)
app.route('/', createDocsRoutes(apiPublicUrl))

serve({ fetch: app.fetch, port }, () => {
  console.log(`Schuco API running on http://localhost:${port}`)
  console.log(`Swagger UI: http://localhost:${port}/docs`)
})

export default app
