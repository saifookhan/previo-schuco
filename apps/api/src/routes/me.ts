import { computePermissions } from '@schuco/contracts'
import { Hono } from 'hono'

import type { AuthVariables } from '../middleware/auth'
import { requireAuth } from '../middleware/auth'
import { getEffectiveRolePermissions } from '../services/role-permissions-service'

const me = new Hono<{ Variables: AuthVariables }>()

/**
 * Current authenticated user profile with RBAC context.
 */
me.get('/', requireAuth, async (c) => {
  const user = c.get('user')
  const permissions = computePermissions(
    user.roles.map((r) => r.id),
    user.company.capabilities,
    await getEffectiveRolePermissions(),
  )
  return c.json({ user: { ...user, permissions } })
})

export { me }
