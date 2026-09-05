import { inviteUserRequestSchema, inviteUserResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import { profileToUserDto } from '../../lib/user-dto'
import { inviteUser } from '../../services/users-service'
import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requireRoles } from '../../middleware/auth'

/**
 * Cross-tenant user invitation for super-admins (ADR 0004). Kept
 * separate from admin/users.ts (cross-tenant listing) — invite is a
 * distinct, side-effecting, multi-system operation worth isolating
 * (ADR 0012).
 */
export const adminInvites = new Hono<{ Variables: AuthVariables }>()

/**
 * Invite a user into any company. `companyId` is required in the body —
 * a super-admin isn't scoped to one company the way a company-admin is.
 */
adminInvites.post('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = inviteUserRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }
  if (!parsedBody.data.companyId) {
    return c.json({ error: 'companyId is required' }, 400)
  }

  const ctx = {
    effectiveCompanyId: parsedBody.data.companyId,
    isSuperAdmin: c.get('isSuperAdmin'),
  }

  const profile = await inviteUser(
    ctx,
    { actorUserId: c.get('actorUserId'), actorCompanyId: c.get('user').company.id },
    parsedBody.data.companyId,
    parsedBody.data,
  )

  const parsed = inviteUserResponseSchema.safeParse({ user: profileToUserDto(profile) })
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data, 201)
})
