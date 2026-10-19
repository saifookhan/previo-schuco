import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { describe, expect, it } from 'vitest'

import { handleUncaughtError, requestContext, type RequestVariables } from '../src/middleware/request-context'

/** Unit test (ADR 0012, no DB): request ids and the last-resort error handler. */
const buildApp = () => {
  const app = new Hono<{ Variables: RequestVariables }>()
  app.use('*', requestContext)
  app.onError(handleUncaughtError)
  app.get('/ok', (c) => c.json({ requestId: c.get('requestId') }))
  app.get('/boom', () => {
    throw new Error('database exploded')
  })
  app.get('/teapot', () => {
    throw new HTTPException(418, { message: 'short and stout' })
  })
  return app
}

describe('requestContext', () => {
  it('gives every request an id and echoes it in X-Request-Id', async () => {
    const res = await buildApp().request('/ok')
    const body = (await res.json()) as { requestId: string }
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.headers.get('X-Request-Id')).toBe(body.requestId)
  })

  it('never adopts an id the caller sent (ids must not be forgeable)', async () => {
    const res = await buildApp().request('/ok', { headers: { 'X-Request-Id': 'abc12345-from-caller' } })
    expect(res.headers.get('X-Request-Id')).not.toBe('abc12345-from-caller')
  })
})

describe('handleUncaughtError', () => {
  it('answers a generic 500 carrying the request id — never the error message', async () => {
    const res = await buildApp().request('/boom')
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; requestId: string }
    expect(body).toEqual({ error: 'Internal server error', requestId: res.headers.get('X-Request-Id') })
  })

  it('keeps the response of an intentional HTTPException', async () => {
    const res = await buildApp().request('/teapot')
    expect(res.status).toBe(418)
  })
})
