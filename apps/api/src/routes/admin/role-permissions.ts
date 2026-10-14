import { rolePermissionsResponseSchema, updateRolePermissionsRequestSchema } from '@schuco/contracts'
import type { Context } from 'hono'
import { Hono } from 'hono'

import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requireRoles } from '../../middleware/auth'
import {
  RolePermissionsValidationError,
  getRolePermissionsView,
  updateRolePermissions,
} from '../../services/role-permissions-service'

/** Global role → permission matrix editor. Super-admin only (not a capability-gated permission: it defines the permissions). */
export const adminRolePermissions = new Hono<{ Variables: AuthVariables }>()

const ctxFrom = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

adminRolePermissions.get('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const view = await getRolePermissionsView(ctxFrom(c))
  const parsed = rolePermissionsResponseSchema.safeParse(view)
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }
  return c.json(parsed.data)
})

adminRolePermissions.put('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = updateRolePermissionsRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }
  try {
    const saved = await updateRolePermissions(
      ctxFrom(c),
      {
        actorUserId: c.get('actorUserId'),
        actorCompanyId: c.get('user').company.id,
        requestId: c.get('requestId'),
      },
      parsedBody.data.matrix,
    )
    return c.json(saved)
  } catch (error) {
    if (error instanceof RolePermissionsValidationError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})
