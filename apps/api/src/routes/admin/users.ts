import { adminUsersListResponseSchema } from '@schuco/contracts'
import { listUsers } from '@schuco/db'
import { Hono } from 'hono'

import { toAdminUserDto } from '../../lib/user-dto'
import { getDb } from '../../lib/db'
import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requireRoles } from '../../middleware/auth'

/** Cross-tenant platform user management for super-admins. */
export const adminUsers = new Hono<{ Variables: AuthVariables }>()

/**
 * List all platform users across companies.
 */
adminUsers.get('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const rows = await listUsers(getDb())
  const payload = { users: rows.map(toAdminUserDto) }
  const parsed = adminUsersListResponseSchema.safeParse(payload)

  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data)
})
