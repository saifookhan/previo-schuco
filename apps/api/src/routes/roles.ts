import { grantableRolesResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { listGrantableRoles } from '../services/roles-service'

/** The roles the caller may give a new user. */
export const roles = new Hono<{ Variables: AuthVariables }>()

roles.get('/', requireAuth, requirePermission('users.manage'), async (c) => {
  const rows = await listGrantableRoles(
    { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') },
    c.get('user').roles.map((r) => r.id),
  )
  return c.json(grantableRolesResponseSchema.parse({ roles: rows }))
})
