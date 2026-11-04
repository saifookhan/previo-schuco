import type { Context, Next } from 'hono'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether `value` is a UUID — check before handing an id to a `uuid` column, or Postgres answers with a 500-causing cast error. */
export const isUuid = (value: string): boolean => UUID_RE.test(value)

const UUID_PARAM = /^(id|.*Id)$/

/**
 * 404 when a matched path param that names an id is not a UUID.
 * Runs before the handler's query so Postgres never sees the bad cast
 * (22P02 → uncaught 500). Same body as an unknown id.
 */
export const rejectNonUuidParams = async (c: Context, next: Next): Promise<Response | void> => {
  for (const [name, value] of Object.entries(c.req.param())) {
    if (!UUID_PARAM.test(name)) continue
    if (typeof value === 'string' && value !== '' && !isUuid(value)) {
      return c.json({ error: 'Not found' }, 404)
    }
  }
  await next()
}
