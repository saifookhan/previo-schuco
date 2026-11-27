process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgresql://127.0.0.1:5434/previo_test'

import { describe, expect, it } from 'vitest'

import { dashboard } from '../src/routes/dashboard'

/** The route is mounted and asks for a session before it touches the database. */
describe('dashboard route', () => {
  it('GET / reaches auth', async () => {
    const response = await dashboard.request('/')
    expect(response.status).toBe(401)
  })

  it('GET /?period=week reaches auth', async () => {
    const response = await dashboard.request('/?period=week&includeTest=1')
    expect(response.status).toBe(401)
  })
})
