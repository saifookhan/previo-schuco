import { inviteUserRequestSchema, inviteUserResponseSchema, usersListResponseSchema } from '@schuco/contracts'
import { Hono } from 'hono'

import { canGrantRole } from '../lib/role-hierarchy'
import { profileToUserDto, toUserDto } from '../lib/user-dto'
import { inviteUser, listUsersForCompany } from '../services/users-service'
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
 * Invite a user into the caller's own company (ADR 0004). Self-scoped —
 * a company-admin can never invite into another company; `companyId` in
 * the request body, if present, is ignored in favor of the caller's own
 * company (the cross-tenant path is POST /api/admin/invites instead).
 */
users.post('/', requireAuth, requireRoles(['company-admin']), async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsedBody = inviteUserRequestSchema.safeParse(body)
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }

  if (!canGrantRole(c.get('user').role.id, parsedBody.data.roleId)) {
    return c.json({ error: `Cannot assign role '${parsedBody.data.roleId}'` }, 403)
  }

  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }

  const profile = await inviteUser(
    ctx,
    { actorUserId: c.get('actorUserId'), actorCompanyId: c.get('user').company.id },
    ctx.effectiveCompanyId,
    parsedBody.data,
  )

  const parsed = inviteUserResponseSchema.safeParse({ user: profileToUserDto(profile) })
  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data, 201)
})
