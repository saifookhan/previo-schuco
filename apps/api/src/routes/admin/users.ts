import { adminUsersListResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import { toAdminUserDto } from '../../lib/user-dto'
import { listAllUsers } from '../../services/users-service'
import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requireRoles } from '../../middleware/auth'

/** Cross-tenant platform user management for super-admins. */
export const adminUsers = new Hono<{ Variables: AuthVariables }>()

/**
 * List all platform users across companies. Deliberately unscoped by
 * X-Tenant-Id/effectiveCompanyId — this route is the platform-wide view,
 * not a per-tenant one, so acting-as-tenant has no effect here.
 */
adminUsers.get('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const rows = await listAllUsers({
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  })
  const payload = { users: rows.map(toAdminUserDto) }
  const parsed = adminUsersListResponseSchema.safeParse(payload)

  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data)
})
