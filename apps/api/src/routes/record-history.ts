import { auditLogListResponseSchema, recordHistoryQuerySchema, type AuditLogListResponse, type RecordHistoryQuery } from '@schuco/contracts'
import type { Context } from 'hono'

import { isUuid } from '../lib/uuid'
import type { AuthVariables } from '../middleware/auth'
import { InvalidAuditCursorError } from '../services/audit-service'

/**
 * Shared handler body for `GET /:id/history` on a record (quote, product family):
 * validates the id and query, runs `load`, and maps the outcomes — null → 404,
 * a bad cursor → 400, `forbidden` errors → 403. Anything else is a real 500.
 * @param c - Route context (`:id` param)
 * @param load - Fetches one history page, or null when the record isn't visible
 * @param forbidden - Error classes that mean "visible, but not your history to see"
 */
export const respondWithRecordHistory = async (
  c: Context<{ Variables: AuthVariables }>,
  load: (id: string, query: RecordHistoryQuery) => Promise<AuditLogListResponse | null>,
  forbidden: Array<new (...args: never[]) => Error> = [],
): Promise<Response> => {
  const id = c.req.param('id')
  if (!id || !isUuid(id)) {
    return c.json({ error: 'Not found' }, 404)
  }
  const parsedQuery = recordHistoryQuerySchema.safeParse(c.req.query())
  if (!parsedQuery.success) {
    return c.json({ error: 'Invalid query', details: parsedQuery.error.issues }, 400)
  }

  try {
    const page = await load(id, parsedQuery.data)
    if (!page) {
      return c.json({ error: 'Not found' }, 404)
    }
    const parsed = auditLogListResponseSchema.safeParse(page)
    if (!parsed.success) {
      return c.json({ error: 'Internal response validation failed' }, 500)
    }
    return c.json(parsed.data)
  } catch (error) {
    if (error instanceof InvalidAuditCursorError) {
      return c.json({ error: error.message }, 400)
    }
    if (forbidden.some((ErrorClass) => error instanceof ErrorClass)) {
      return c.json({ error: (error as Error).message }, 403)
    }
    throw error
  }
}
