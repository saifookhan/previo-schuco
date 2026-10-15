import { inviteUserRequestSchema, inviteUserResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import { profileToUserDto } from '../../lib/user-dto'
import {
  InvalidBusinessUnitsError,
  InviteConflictError,
  RoleNotGrantableError,
  UnknownRoleError,
  inviteUser,
} from '../../services/users-service'
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

  let profile
  try {
    profile = await inviteUser(
      ctx,
      {
        actorUserId: c.get('actorUserId'),
        actorCompanyId: c.get('user').company.id,
        callerRoleIds: c.get('user').roles.map((r) => r.id),
        requestId: c.get('requestId'),
      },
      parsedBody.data.companyId,
      parsedBody.data,
      false, // requiresApproval — a super-admin IS the approver, nothing to gate (Stage 3)
    )
  } catch (error) {
    if (error instanceof UnknownRoleError) {
      return c.json({ error: error.message }, 400)
    }
    if (error instanceof RoleNotGrantableError) {
      return c.json({ error: error.message }, 403)
    }
    if (error instanceof InvalidBusinessUnitsError) {
      return c.json({ error: error.message }, 400)
    }
    if (error instanceof InviteConflictError) {
      return c.json({ error: error.message }, 409)
    }
    throw error
  }

  const parsed = inviteUserResponseSchema.safeParse({ user: profileToUserDto(profile) })
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data, 201)
})
