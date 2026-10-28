process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { describe, expect, it } from 'vitest'

import { adminUsers } from '../src/routes/admin/users'
import { productFamilies } from '../src/routes/product-families'
import { salesQuotes } from '../src/routes/sales-quotes'
import { getProductFamilyDetail } from '../src/services/product-families-service'

const FAMILY = '00000000-0000-4000-8000-000000000001'

describe('UUID path params', () => {
  it('GET /product-families/:id with a malformed id is 404, not 500', async () => {
    const response = await productFamilies.request('/not-a-uuid')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it('GET shares, images and a sales quote with a malformed id are 404', async () => {
    const shares = await productFamilies.request('/not-a-uuid/shares')
    const image = await productFamilies.request(`/${FAMILY}/images/not-a-uuid`)
    const quote = await salesQuotes.request('/not-a-uuid')
    expect(shares.status).toBe(404)
    expect(image.status).toBe(404)
    expect(quote.status).toBe(404)
  })

  it('a well-formed family id still reaches auth (401), so unknown ids are not all rejected as malformed', async () => {
    const response = await productFamilies.request(`/${FAMILY}`)
    expect(response.status).toBe(401)
  })

  it('does not treat the static /admin/users/pending path as a user id', async () => {
    const response = await adminUsers.request('/pending')
    expect(response.status).not.toBe(404)
  })

  it('approve with a malformed id is 404', async () => {
    const response = await adminUsers.request('/not-a-uuid/approve', { method: 'POST' })
    expect(response.status).toBe(404)
  })

  it('getProductFamilyDetail returns null for a malformed id', async () => {
    await expect(
      getProductFamilyDetail({ effectiveCompanyId: 'not-used', isSuperAdmin: true }, 'not-a-uuid'),
    ).resolves.toBeNull()
  })
})

describe('product family import without a multipart file', () => {
  it.each(['/import/preview', '/import'])('POST %s with a JSON body is 400', async (path) => {
    const response = await productFamilies.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toMatch(/multipart/i)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
  })

  it('POST /import/preview with no content type is 400', async () => {
    const response = await productFamilies.request('/import/preview', { method: 'POST', body: '{}' })
    expect(response.status).toBe(400)
  })
})
