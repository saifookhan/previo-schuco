import { auditLogListResponseSchema, auditLogQuerySchema } from '@schuco/contracts'
import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'
import { InvalidAuditCursorError, listAuditLog } from '../services/audit-service'

/**
 * Read-only audit log viewer (ADR 0010). Company admins see their own
 * company's entries; super-admins see every company. The table itself is
 * append-only — there is deliberately no write or delete endpoint.
 */
export const auditLogRoutes = new Hono<{ Variables: AuthVariables }>()

auditLogRoutes.get('/', requireAuth, requireRoles(['super-admin', 'company-admin']), async (c) => {
  const parsedQuery = auditLogQuerySchema.safeParse(c.req.query())
  if (!parsedQuery.success) {
    return c.json({ error: 'Invalid query', details: parsedQuery.error.issues }, 400)
  }

  try {
    const page = await listAuditLog(
      {
        effectiveCompanyId: c.get('effectiveCompanyId'),
        isSuperAdmin: c.get('isSuperAdmin'),
        isActingAsTenant: c.get('isActingAsTenant'),
      },
      parsedQuery.data,
    )
    const parsed = auditLogListResponseSchema.safeParse(page)
    if (!parsed.success) {
      return c.json({ error: 'Internal response validation failed' }, 500)
    }
    return c.json(parsed.data)
  } catch (error) {
    if (error instanceof InvalidAuditCursorError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})
