import { adminUsersListResponseSchema, inviteUserResponseSchema } from '@schuco/contracts'
import type { Context } from 'hono'
import { Hono } from 'hono'

import { profileToUserDto, toAdminUserDto } from '../../lib/user-dto'
import {
  NotPendingApprovalError,
  approveInvite,
  listAllUsers,
  listPendingApprovalUsers,
  rejectInvite,
  type ApprovalActor,
} from '../../services/users-service'
import { rejectNonUuidParams } from '../../lib/uuid'
import type { AuthVariables } from '../../middleware/auth'
import { requireAuth, requireRoles } from '../../middleware/auth'

/** Cross-tenant platform user management for super-admins. */
export const adminUsers = new Hono<{ Variables: AuthVariables }>()

const ctxFrom = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

const actorFrom = (c: Context<{ Variables: AuthVariables }>): ApprovalActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

/**
 * List all platform users across companies. Deliberately unscoped by
 * X-Tenant-Id/effectiveCompanyId — this route is the platform-wide view,
 * not a per-tenant one, so acting-as-tenant has no effect here.
 */
adminUsers.get('/', requireAuth, requireRoles(['super-admin']), async (c) => {
  const rows = await listAllUsers(ctxFrom(c))
  const payload = { users: rows.map(toAdminUserDto) }
  const parsed = adminUsersListResponseSchema.safeParse(payload)

  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data)
})

/** Users awaiting approval (Stage 3) — company-admin-requested invites, across every company. */
adminUsers.get('/pending', requireAuth, requireRoles(['super-admin']), async (c) => {
  const rows = await listPendingApprovalUsers(ctxFrom(c))
  const payload = { users: rows.map(toAdminUserDto) }
  const parsed = adminUsersListResponseSchema.safeParse(payload)

  if (!parsed.success) {
    return c.json({ error: 'Internal response validation failed' }, 500)
  }

  return c.json(parsed.data)
})

/** Approves a pending invite request — sends the actual invite email. */
adminUsers.post('/:id/approve', rejectNonUuidParams, requireAuth, requireRoles(['super-admin']), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }

  try {
    const profile = await approveInvite(ctxFrom(c), actorFrom(c), id)
    const parsed = inviteUserResponseSchema.safeParse({ user: profileToUserDto(profile) })
    if (!parsed.success) {
      return c.json({ error: 'Internal response validation failed' }, 500)
    }
    return c.json(parsed.data)
  } catch (error) {
    if (error instanceof NotPendingApprovalError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})

/** Rejects a pending invite request — deletes it outright (nothing was ever activated). */
adminUsers.post('/:id/reject', rejectNonUuidParams, requireAuth, requireRoles(['super-admin']), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }

  try {
    await rejectInvite(ctxFrom(c), actorFrom(c), id)
    return c.json({ ok: true })
  } catch (error) {
    if (error instanceof NotPendingApprovalError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})
