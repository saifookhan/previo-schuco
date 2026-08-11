import { Hono } from 'hono'

/** Platform health check. */
export const health = new Hono()

health.get('/', (c) => c.json({ status: 'ok', service: 'schuco-api' }))
