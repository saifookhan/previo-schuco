import { createRoleRequestSchema, rolesListResponseSchema } from '@schuco/contracts'
import type { Context } from 'hono'
import { Hono } from 'hono'

import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requireRoles } from '../../middleware/auth'
import {
  RoleInUseError,
  RoleNotFoundError,
  RoleValidationError,
  createRole,
  deleteRole,
  listRolesWithCounts,
  type RoleActor,
} from '../../services/roles-service'

/** Role management (super-admin): list with user counts, create a custom role, delete an unused one. */
export const adminRoles = new Hono<{ Variables: AuthVariables }>()

const ctxFrom = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

const actorFrom = (c: Context<{ Variables: AuthVariables }>): RoleActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

adminRoles.get('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const parsed = rolesListResponseSchema.safeParse({ roles: await listRolesWithCounts(ctxFrom(c)) })
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }
  return c.json(parsed.data)
})

adminRoles.post('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const parsedBody = createRoleRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }
  try {
    return c.json({ role: await createRole(ctxFrom(c), actorFrom(c), parsedBody.data) }, 201)
  } catch (error) {
    if (error instanceof RoleValidationError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})

adminRoles.delete('/:id', requireAuth, requireRoles(['super-admin']), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  try {
    await deleteRole(ctxFrom(c), actorFrom(c), id)
    return c.json({ ok: true })
  } catch (error) {
    if (error instanceof RoleNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    if (error instanceof RoleInUseError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }
})
