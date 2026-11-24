process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { describe, expect, it } from 'vitest'

import { salesQuotes } from '../src/routes/sales-quotes'

/**
 * Routing only (no DB/auth needed): every endpoint the builder calls is
 * registered, so a request reaches auth (401) instead of matching nothing
 * (404). Hono resolves a static route vs. a param route at the same
 * position by registration order, so the static `/price-lines` must stay
 * a route of its own and never be read as a quote id.
 */
describe('sales-quotes routes', () => {
  const VERSION = '00000000-0000-0000-0000-000000000000'
  it.each([
    ['POST', '/'],
    ['GET', '/'],
    ['POST', '/price-lines'],
    ['GET', `/${VERSION}`],
    ['GET', `/${VERSION}/print`],
    ['GET', `/${VERSION}/history`],
    ['PUT', `/${VERSION}/versions/${VERSION}`],
    ['POST', `/${VERSION}/versions/${VERSION}/status`],
    ['GET', `/${VERSION}/versions/${VERSION}/revisions`],
    ['GET', `/${VERSION}/versions/${VERSION}/revisions/1`],
  ])('%s %s reaches auth', async (method, path) => {
    const res = await salesQuotes.request(path, { method })
    expect(res.status).toBe(401)
  })
})
