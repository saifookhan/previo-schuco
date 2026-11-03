import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { logger } from './lib/logger'
import type { AuthVariables } from './middleware/auth'
import { handleUncaughtError, requestContext } from './middleware/request-context'
import { adminCompanies } from './routes/admin/companies'
import { adminInvites } from './routes/admin/invites'
import { adminRolePermissions } from './routes/admin/role-permissions'
import { adminRoles } from './routes/admin/roles'
import { adminUsers } from './routes/admin/users'
import { auditLogRoutes } from './routes/audit-log'
import { auth } from './routes/auth'
import { calculate } from './routes/calculate'
import { createDocsRoutes } from './routes/docs'
import { health } from './routes/health'
import { me } from './routes/me'
import { notifications } from './routes/notifications'
import { partners } from './routes/partners'
import { productFamilies } from './routes/product-families'
import { products } from './routes/products'
import { quotes } from './routes/quotes'
import { roles } from './routes/roles'
import { salesQuotes } from './routes/sales-quotes'
import { users } from './routes/users'

const app = new Hono<{ Variables: AuthVariables }>()

const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())

const port = Number(process.env.PORT ?? 3001)
const apiPublicUrl = process.env.API_PUBLIC_URL ?? `http://localhost:${port}`

app.use('*', requestContext)
app.use('*', cors({ origin: corsOrigins, credentials: true, exposeHeaders: ['X-Request-Id'] }))
app.onError(handleUncaughtError)

app.route('/health', health)
app.route('/api/auth', auth)
app.route('/api/me', me)
app.route('/api/users', users)
app.route('/api/admin/users', adminUsers)
app.route('/api/admin/invites', adminInvites)
app.route('/api/admin/companies', adminCompanies)
app.route('/api/admin/role-permissions', adminRolePermissions)
app.route('/api/admin/roles', adminRoles)
app.route('/api/roles', roles)
app.route('/api/audit-log', auditLogRoutes)
app.route('/api/products', products)
app.route('/api/product-families', productFamilies)
app.route('/api/quotes', quotes)
app.route('/api/sales-quotes', salesQuotes)
app.route('/api/calculate', calculate)
app.route('/api/partners', partners)
app.route('/api/notifications', notifications)
app.route('/', createDocsRoutes(apiPublicUrl))

serve({ fetch: app.fetch, port }, () => {
  logger.info({ port, swaggerUi: `http://localhost:${port}/docs` }, 'Schuco API running')
})

export default app
