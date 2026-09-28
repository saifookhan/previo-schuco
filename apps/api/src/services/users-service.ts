import {
  createInvitedUser,
  filterBusinessUnitIdsByCompany,
  getUserByEmailInCompany,
  getUserProfileById,
  listUsers,
  markInviteFailed,
  resetInvitePending,
  type UserListRow,
  type UserProfile,
} from '@schuco/db'

import { canGrantRole } from '../lib/role-hierarchy'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { issueInviteToken } from './auth-service'
import { recordAuditEvent } from './audit-service'

/** The caller's role isn't allowed to grant the requested role (see `canGrantRole`). */
export class RoleNotGrantableError extends Error {}

/** One or more requested `businessUnitIds` don't belong to `companyId`. */
export class InvalidBusinessUnitsError extends Error {}

/**
 * A user with this email already exists in this company and isn't a
 * resumable pending invite (`'invited'`/`'invite_failed'`) — e.g. already
 * `'active'`. Distinct from the retry path, where an existing pending
 * invite is resumed instead of rejected.
 */
export class InviteConflictError extends Error {}

/**
 * List users in the caller's own company (or, for a super-admin sending
 * X-Tenant-Id, the company they're acting as — ADR 0008). Narrowed by an
 * explicit `companyId` filter, not RLS alone — RLS's `is_super_admin()`
 * bypass means a super-admin's results wouldn't otherwise be narrowed by
 * `X-Tenant-Id` (ADR 0006, ADR 0008).
 * @param ctx - Tenant context resolved by `requireAuth`
 */
export const listUsersForCompany = (ctx: TenantContext): Promise<UserListRow[]> =>
  withTenantDb(ctx, (tx) => listUsers(tx, ctx.effectiveCompanyId))

/**
 * List all platform users across every company — deliberately unscoped by
 * `effectiveCompanyId`; this is the platform-wide view, not a per-tenant
 * one, so acting-as-tenant has no effect here.
 * @param ctx - Tenant context resolved by `requireAuth`
 */
export const listAllUsers = (ctx: TenantContext): Promise<UserListRow[]> =>
  withTenantDb(ctx, (tx) => listUsers(tx))

export interface InviteUserInput {
  email: string
  name?: string
  roleId: string
  businessUnitIds?: string[]
}

export interface InviteActor {
  actorUserId: string
  actorCompanyId: string
  /** Role of the user performing the invite — enforced here via `canGrantRole`, not just at the route (defense in depth: this is the one place every invite path funnels through). */
  callerRoleId: string
  /** Correlates this invite's audit entry back to the HTTP request (ADR 0010). */
  requestId?: string | null
}

/**
 * Invite a user into `companyId` (ADR 0004), or resume a still-pending
 * invite for the same email. The DB grant is created/updated and
 * committed first — it's authoritative; the invite email (via Resend)
 * happens after, separately, so a failure there only ever leaves "a DB
 * grant with no invite email sent yet" (queryable as `status:
 * 'invite_failed'`), never a sent email with no DB record.
 *
 * `email` is globally unique, so a second invite to the same address is
 * handled explicitly rather than left to hit the unique constraint: an
 * existing `'invited'`/`'invite_failed'` row in this company is a retry
 * (resend the invite email, no new row); anything else (already
 * `'active'`, or a different company entirely — which RLS would hide,
 * surfacing as "not found" here) is a conflict.
 *
 * Callers: the company-admin route forces `companyId` to the caller's
 * own company; the super-admin route takes it explicitly from the
 * request body. Neither ever comes from a URL path (ADR 0001).
 * @param ctx - Tenant context resolved by `requireAuth`
 * @param actor - Who's inviting, for authorization and the audit record
 * @param companyId - Company the invited user belongs to
 * @param input - Invitee details
 * @throws {RoleNotGrantableError} `actor.callerRoleId` may not grant `input.roleId`
 * @throws {InvalidBusinessUnitsError} a requested business unit doesn't belong to `companyId`
 * @throws {InviteConflictError} the email is already taken by a non-pending user
 */
export const inviteUser = async (
  ctx: TenantContext,
  actor: InviteActor,
  companyId: string,
  input: InviteUserInput,
): Promise<UserProfile> => {
  if (!canGrantRole(actor.callerRoleId, input.roleId)) {
    throw new RoleNotGrantableError(`'${actor.callerRoleId}' cannot assign role '${input.roleId}'`)
  }

  let validBusinessUnitIds: string[] = []
  if (input.businessUnitIds?.length) {
    validBusinessUnitIds = await withTenantDb(ctx, (tx) =>
      filterBusinessUnitIdsByCompany(tx, companyId, input.businessUnitIds!),
    )
    if (validBusinessUnitIds.length !== input.businessUnitIds.length) {
      throw new InvalidBusinessUnitsError('One or more businessUnitIds do not belong to this company')
    }
  }

  const auditActor = {
    actorType: 'user' as const,
    actorUserId: actor.actorUserId,
    actorCompanyId: actor.actorCompanyId,
    requestId: actor.requestId,
  }

  const created = await withTenantDb(ctx, async (tx) => {
    const existing = await getUserByEmailInCompany(tx, companyId, input.email)

    if (existing) {
      if (existing.status !== 'invited' && existing.status !== 'invite_failed') {
        throw new InviteConflictError(`A user with email '${input.email}' already exists`)
      }
      // Retry: resend the invite email for the existing pending row, no new insert.
      const profile = await getUserProfileById(tx, existing.id)
      if (!profile) {
        throw new Error('Failed to load existing invited user profile')
      }
      await recordAuditEvent(tx, auditActor, companyId, {
        action: 'user.invite.retry',
        resourceType: 'user',
        resourceId: profile.id,
        metadata: { email: input.email, roleId: input.roleId },
      })
      return profile
    }

    const profile = await createInvitedUser(tx, {
      email: input.email,
      name: input.name,
      companyId,
      roleId: input.roleId,
      businessUnitIds: validBusinessUnitIds,
    })
    await recordAuditEvent(tx, auditActor, companyId, {
      action: 'user.invite',
      resourceType: 'user',
      resourceId: profile.id,
      metadata: { email: input.email, roleId: input.roleId },
    })
    return profile
  })

  try {
    await issueInviteToken(created.id, input.email, input.name ?? created.name)
    if (created.status === 'invite_failed') {
      await withTenantDb(ctx, (tx) => resetInvitePending(tx, created.id))
      return { ...created, status: 'invited' }
    }
    return created
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[usersService.inviteUser] Invite email failed for ${input.email}:`, error)
    await withTenantDb(ctx, (tx) => markInviteFailed(tx, created.id))
    return { ...created, status: 'invite_failed' }
  }
}
