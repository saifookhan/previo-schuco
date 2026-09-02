import { usersListResponseSchema } from '@schuco/contracts'
import { listUsers } from '@schuco/db'
import { Hono } from 'hono'

import { toUserDto } from '../lib/user-dto'
import { getDb } from '../lib/db'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'

/** Tenant-scoped user management for company admins. */
export const users = new Hono<{ Variables: AuthVariables }>()

/**
 * List users in the authenticated user's company.
 */
users.get('/', requireAuth, requireRoles(['company-admin']), async (c) => {
  const rows = await listUsers(getDb())
  const payload = { users: rows.map(toUserDto) }
  const parsed = usersListResponseSchema.safeParse(payload)

  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data)
})
