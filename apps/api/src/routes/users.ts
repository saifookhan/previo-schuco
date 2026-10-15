import { inviteUserRequestSchema, inviteUserResponseSchema, usersListResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import { profileToUserDto, toUserDto } from '../lib/user-dto'
import {
  InvalidBusinessUnitsError,
  InviteConflictError,
  RoleNotGrantableError,
  UnknownRoleError,
  inviteUser,
  listUsersForCompany,
} from '../services/users-service'
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

/**
 * Request a new user in the caller's own company (ADR 0004). Self-scoped
 * — a company-admin can never invite into another company; `companyId`
 * in the request body, if present, is ignored in favor of the caller's
 * own company (the cross-tenant path is POST /api/admin/invites
 * instead). Stage 3: this always requires approval — the created user
 * starts `'pending_approval'`, and no invite email goes out until a
 * super-admin calls POST /api/admin/users/:id/approve.
 */
users.post('/', requireAuth, requireRoles(['company-admin']), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = inviteUserRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
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
      ctx.effectiveCompanyId,
      parsedBody.data,
      true, // requiresApproval — a company-admin's own invite always needs a super-admin's sign-off (Stage 3)
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
