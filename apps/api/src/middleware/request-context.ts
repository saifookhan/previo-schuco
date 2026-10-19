import type { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { logger } from '../lib/logger'

export type RequestVariables = {
  /** Correlates this request's log lines and audit entries (ADR 0010). Set for every request, authenticated or not. */
  requestId: string
}

/** What the access log reads back after the handler ran — set by `requireAuth`, absent on public routes. */
type AccessLogVariables = RequestVariables & { actorUserId?: string; effectiveCompanyId?: string }

const REQUEST_ID_HEADER = 'X-Request-Id'

/** Requests that would only add noise to the logs at `info` (container healthchecks). */
const QUIET_PATHS = new Set(['/health'])

/**
 * Gives every request a fresh id — never one the caller sent, so nobody can make
 * their requests share an id with someone else's in the logs and audit trail —
 * echoes it in the response header, and writes
 * one access-log line when the response is done: method, path (never the
 * query string — it can carry tokens), status, duration and, once
 * `requireAuth` has run, who made it.
 */
export const requestContext = async (c: Context<{ Variables: AccessLogVariables }>, next: Next): Promise<void> => {
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  c.header(REQUEST_ID_HEADER, requestId)

  const startedAt = performance.now()
  await next()

  const status = c.res.status
  const entry = {
    requestId,
    method: c.req.method,
    path: c.req.path,
    status,
    durationMs: Math.round(performance.now() - startedAt),
    userId: c.get('actorUserId'),
    companyId: c.get('effectiveCompanyId'),
  }
  if (status >= 500) {
    logger.error(entry, 'request failed')
  } else if (QUIET_PATHS.has(c.req.path)) {
    logger.debug(entry, 'request')
  } else {
    logger.info(entry, 'request')
  }
}

/**
 * Last-resort error handler: logs the error with its request id and answers
 * a generic 500 that includes the id — so a user's error report can be matched
 * to the exact log lines. Hono's own HTTPExceptions keep their intended response.
 */
export const handleUncaughtError = <E extends { Variables: RequestVariables }>(error: Error, c: Context<E>): Response => {
  if (error instanceof HTTPException) {
    return error.getResponse()
  }
  const requestId = c.var.requestId
  logger.error({ err: error, requestId, method: c.req.method, path: c.req.path }, 'unhandled error')
  return c.json({ error: 'Internal server error', requestId }, 500)
}
