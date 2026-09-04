import { usersListResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import { toUserDto } from '../lib/user-dto'
import { listUsersForCompany } from '../services/users-service'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'

/** Tenant-scoped user management for company admins. */
export const users = new Hono<{ Variables: AuthVariables }>()

/**
 * List users in the authenticated user's company (or, for a super-admin
 * sending X-Tenant-Id, the company they're acting as — see ADR 0008).
 */
users.get('/', requireAuth, requireRoles(['company-admin', 'super-admin']), async (c) => {
  const rows = await listUsersForCompany({
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  })
  const payload = { users: rows.map(toUserDto) }
  const parsed = usersListResponseSchema.safeParse(payload)

  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data)
})
