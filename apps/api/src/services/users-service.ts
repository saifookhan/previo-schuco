import {
  approveUser,
  createInvitedUser,
  deletePendingUser,
  filterBusinessUnitIdsByCompany,
  getUserByEmailInCompany,
  getUserProfileById,
  listAllRoles,
  listUsers,
  markInviteFailed,
  resetInvitePending,
  lockActiveCompanyAdminIds,
  setUserRoles,
  updateUserDetails,
  type DbLike,
  type UserListRow,
  type UserProfile,
} from '@schuco/db'

import type { RolePermissionMatrix } from '@schuco/contracts'

import { logger } from '../lib/logger'
import { canGrantByPermissions, canGrantRoles } from '../lib/role-hierarchy'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { issueInviteToken } from './auth-service'
import { recordAuditEvent } from './audit-service'
import { getEffectiveRolePermissions } from './role-permissions-service'

/** The caller's role isn't allowed to grant the requested role (see `canGrantRoles`). */
export class RoleNotGrantableError extends Error {}

/** A requested role id doesn't exist (e.g. a custom role deleted since the form loaded). */
export class UnknownRoleError extends Error {}

/** One or more requested `businessUnitIds` don't belong to `companyId`. */
export class InvalidBusinessUnitsError extends Error {}

/**
 * A user with this email already exists in this company and isn't a
 * resumable pending invite (`'pending_approval'`/`'invited'`/`'invite_failed'`)
 * — e.g. already `'active'`. Distinct from the retry path, where an
 * existing pending invite is resumed instead of rejected.
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

/**
 * Every role in `roleIds` exists and `callerRoleIds` may hand it out — by rank (`canGrantRoles`)
 * and by permissions (`canGrantByPermissions`). The one rule both inviting and editing use.
 * @throws {UnknownRoleError} a role doesn't exist
 * @throws {RoleNotGrantableError} the caller may not grant one of them
 */
const assertRolesGrantable = async (
  tx: DbLike,
  callerRoleIds: string[],
  roleIds: string[],
  matrix: RolePermissionMatrix,
): Promise<void> => {
  const knownRoles = new Set((await listAllRoles(tx)).map((role) => role.id))
  const unknownRole = roleIds.find((id) => !knownRoles.has(id))
  if (unknownRole) {
    throw new UnknownRoleError(`Unknown role '${unknownRole}'`)
  }
  if (!canGrantRoles(callerRoleIds, roleIds) || !canGrantByPermissions(callerRoleIds, roleIds, matrix)) {
    throw new RoleNotGrantableError(`'${callerRoleIds.join(', ')}' cannot assign role(s) '${roleIds.join(', ')}'`)
  }
}

export interface InviteUserInput {
  email: string
  name?: string
  roleIds: string[]
  businessUnitIds?: string[]
}

export interface InviteActor {
  actorUserId: string
  actorCompanyId: string
  /** All roles of the user performing the invite — enforced here via `canGrantRoles`, not just at the route (defense in depth: this is the one place every invite path funnels through). */
  callerRoleIds: string[]
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
 * existing `'pending_approval'`/`'invited'`/`'invite_failed'` row in
 * this company is a retry (resend the invite email, or for a still-
 * pending-approval row, just a no-op — nothing to resend until it's
 * approved); anything else (already `'active'`, or a different company
 * entirely — which RLS would hide, surfacing as "not found" here) is a
 * conflict.
 *
 * Callers: the company-admin route forces `companyId` to the caller's
 * own company AND `requiresApproval: true` (Stage 3 — a company-admin's
 * own invites always need a super-admin's sign-off, via `approveInvite`
 * below); the super-admin route takes `companyId` from the request body
 * and `requiresApproval: false` (a super-admin IS the approver, so
 * there's nothing to gate). Neither `companyId` ever comes from a URL
 * path (ADR 0001).
 * @param ctx - Tenant context resolved by `requireAuth`
 * @param actor - Who's inviting, for authorization and the audit record
 * @param companyId - Company the invited user belongs to
 * @param input - Invitee details
 * @param requiresApproval - True: create as `'pending_approval'`, no email sent yet. False: invite immediately.
 * @throws {UnknownRoleError} a requested role doesn't exist
 * @throws {RoleNotGrantableError} `actor.callerRoleIds` may not grant `input.roleIds`
 * @throws {InvalidBusinessUnitsError} a requested business unit doesn't belong to `companyId`
 * @throws {InviteConflictError} the email is already taken by a non-pending user
 */
export const inviteUser = async (
  ctx: TenantContext,
  actor: InviteActor,
  companyId: string,
  input: InviteUserInput,
  requiresApproval: boolean,
): Promise<UserProfile> => {
  const matrix = await getEffectiveRolePermissions()
  await withTenantDb(ctx, (tx) => assertRolesGrantable(tx, actor.callerRoleIds, input.roleIds, matrix))

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

  const { created, wasPendingApproval } = await withTenantDb(ctx, async (tx) => {
    const existing = await getUserByEmailInCompany(tx, companyId, input.email)

    if (existing) {
      if (existing.status !== 'invited' && existing.status !== 'invite_failed' && existing.status !== 'pending_approval') {
        throw new InviteConflictError(`A user with email '${input.email}' already exists`)
      }
      // Re-inviting is also how a pending invite's roles get corrected — apply the (already grant-checked) new set.
      await setUserRoles(tx, existing.id, input.roleIds)
      const profile = await getUserProfileById(tx, existing.id)
      if (!profile) {
        throw new Error('Failed to load existing invited user profile')
      }
      await recordAuditEvent(tx, auditActor, companyId, {
        action: existing.status === 'pending_approval' ? 'user.invite.request.retry' : 'user.invite.retry',
        resourceType: 'user',
        resourceId: profile.id,
        metadata: { email: input.email, roleIds: input.roleIds },
      })
      return { created: profile, wasPendingApproval: existing.status === 'pending_approval' }
    }

    const profile = await createInvitedUser(tx, {
      email: input.email,
      name: input.name,
      companyId,
      roleIds: input.roleIds,
      businessUnitIds: validBusinessUnitIds,
      initialStatus: requiresApproval ? 'pending_approval' : 'invited',
    })
    await recordAuditEvent(tx, auditActor, companyId, {
      action: requiresApproval ? 'user.invite.request' : 'user.invite',
      resourceType: 'user',
      resourceId: profile.id,
      metadata: { email: input.email, roleIds: input.roleIds },
    })
    return { created: profile, wasPendingApproval: requiresApproval }
  })

  // Nothing to email yet — still waiting on a super-admin's approveInvite call.
  if (wasPendingApproval) {
    return created
  }

  try {
    await issueInviteToken(created.id, input.email, input.name ?? created.name)
    if (created.status === 'invite_failed') {
      await withTenantDb(ctx, (tx) => resetInvitePending(tx, created.id))
      return { ...created, status: 'invited' }
    }
    return created
  } catch (error) {
    logger.error({ err: error, email: input.email, userId: created.id, requestId: actor.requestId }, 'invite email failed')
    await withTenantDb(ctx, (tx) => markInviteFailed(tx, created.id))
    return { ...created, status: 'invite_failed' }
  }
}

/** No such user in the caller's company (another company's users surface the same way). */
export class UserNotFoundError extends Error {}

/** The change is not allowed: locking yourself out, or activating an account whose invite isn't finished. */
export class UserUpdateRejectedError extends Error {}

export interface UpdateUserInput {
  name: string | null
  roleIds: string[]
  /** Only switches between active and inactive. */
  status?: 'active' | 'inactive'
}

/**
 * Edits a user of the caller's company: name, roles, and active/inactive. Only a super-admin
 * may touch a super-admin account; any role added or removed must be one the caller can grant.
 * Nobody can deactivate themselves or drop their own super-admin/company-admin role, and the
 * company always keeps at least one active company-admin. Saving with nothing changed writes
 * nothing. An inactive user is signed out on their next request (`requireAuth` checks the status).
 * @param ctx - Tenant context resolved by `requireAuth`
 * @param actor - Who's editing, for authorization and the audit record
 * @param userId - The user to edit
 * @param input - New name, roles and optional status
 * @throws {UserNotFoundError} no such user in the caller's company
 * @throws {UnknownRoleError} a requested role doesn't exist
 * @throws {RoleNotGrantableError} the caller may not grant the user's current or new roles
 * @throws {UserUpdateRejectedError} self-lockout, removing the last active company-admin, or a status change on an unfinished invite
 */
export const updateCompanyUser = async (
  ctx: TenantContext,
  actor: InviteActor,
  userId: string,
  input: UpdateUserInput,
): Promise<UserProfile> => {
  const matrix = await getEffectiveRolePermissions()
  return withTenantDb(ctx, async (tx) => {
    const before = await getUserProfileById(tx, userId)
    if (!before || before.company.id !== ctx.effectiveCompanyId) {
      throw new UserNotFoundError('User not found')
    }

    const previousRoleIds = before.roles.map((role) => role.id)
    // Only a super-admin touches a super-admin account at all — not even its name.
    if (previousRoleIds.includes('super-admin') && !actor.callerRoleIds.includes('super-admin')) {
      throw new RoleNotGrantableError('Only a super-admin can edit a super-admin')
    }
    // Roles kept as they are need no grant right (a name-only edit of a user with a custom role
    // the caller lacks still works); every role added or taken away does.
    const changedRoleIds = [
      ...input.roleIds.filter((id) => !previousRoleIds.includes(id)),
      ...previousRoleIds.filter((id) => !input.roleIds.includes(id)),
    ]
    if (changedRoleIds.length > 0) {
      await assertRolesGrantable(tx, actor.callerRoleIds, changedRoleIds, matrix)
    }

    const statusChanged = input.status !== undefined && input.status !== before.status
    if (statusChanged && before.status !== 'active' && before.status !== 'inactive') {
      throw new UserUpdateRejectedError('This user has not accepted their invite yet')
    }
    if (userId === actor.actorUserId) {
      if (input.status === 'inactive') {
        throw new UserUpdateRejectedError('You cannot deactivate your own account')
      }
      const droppedAdminRole = ['super-admin', 'company-admin'].find(
        (role) => previousRoleIds.includes(role) && !input.roleIds.includes(role),
      )
      if (droppedAdminRole) {
        throw new UserUpdateRejectedError(`You cannot remove your own ${droppedAdminRole === 'super-admin' ? 'Super Admin' : 'Company Admin'} role`)
      }
    }
    // The company must keep at least one active company-admin — also when two admins demote each other.
    const wasActiveAdmin = before.status === 'active' && previousRoleIds.includes('company-admin')
    const staysActiveAdmin = (statusChanged ? input.status : before.status) === 'active' && input.roleIds.includes('company-admin')
    if (wasActiveAdmin && !staysActiveAdmin) {
      const activeAdmins = await lockActiveCompanyAdminIds(tx, ctx.effectiveCompanyId)
      if (activeAdmins.filter((id) => id !== userId).length === 0) {
        throw new UserUpdateRejectedError('The company needs at least one active Company Admin')
      }
    }

    const nameChanged = input.name !== before.name
    if (!nameChanged && !statusChanged && changedRoleIds.length === 0) {
      return before
    }

    if (nameChanged || statusChanged) {
      await updateUserDetails(tx, userId, { name: input.name, status: statusChanged ? input.status : undefined })
    }
    if (changedRoleIds.length > 0) {
      await setUserRoles(tx, userId, input.roleIds)
    }
    await recordAuditEvent(
      tx,
      {
        actorType: 'user',
        actorUserId: actor.actorUserId,
        actorCompanyId: actor.actorCompanyId,
        requestId: actor.requestId,
      },
      ctx.effectiveCompanyId,
      {
        action: 'user.update',
        resourceType: 'user',
        resourceId: userId,
        metadata: {
          email: before.email,
          ...(nameChanged ? { name: input.name, previousName: before.name } : {}),
          ...(changedRoleIds.length > 0 ? { roleIds: input.roleIds, previousRoleIds } : {}),
          ...(statusChanged ? { status: input.status, previousStatus: before.status } : {}),
        },
      },
    )

    const after = await getUserProfileById(tx, userId)
    if (!after) {
      throw new Error('Failed to reload the updated user')
    }
    return after
  })
}

export interface ApprovalActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

/** The target user isn't currently `'pending_approval'` (already approved/rejected/never existed). */
export class NotPendingApprovalError extends Error {}

/**
 * Approves a company-admin's pending invite request: flips
 * `'pending_approval'` -> `'invited'` and sends the actual invite email
 * (Resend) — the step `inviteUser` deliberately skipped when it created
 * this row. Cross-tenant by nature (a super-admin approving into any
 * company), so `ctx` is unscoped like `listAllUsers`.
 * @throws {NotPendingApprovalError} the user isn't awaiting approval
 */
export const approveInvite = async (ctx: TenantContext, actor: ApprovalActor, userId: string): Promise<UserProfile> => {
  const approved = await withTenantDb(ctx, (tx) => approveUser(tx, userId))
  if (!approved) {
    throw new NotPendingApprovalError(`User '${userId}' is not awaiting approval`)
  }

  const auditActor = {
    actorType: 'user' as const,
    actorUserId: actor.actorUserId,
    actorCompanyId: actor.actorCompanyId,
    requestId: actor.requestId,
  }
  await withTenantDb(ctx, (tx) =>
    recordAuditEvent(tx, auditActor, approved.company.id, {
      action: 'user.invite.approve',
      resourceType: 'user',
      resourceId: approved.id,
      metadata: { email: approved.email },
    }),
  )

  try {
    await issueInviteToken(approved.id, approved.email, approved.name)
    return approved
  } catch (error) {
    logger.error({ err: error, email: approved.email, userId: approved.id, requestId: actor.requestId }, 'invite email failed on approval')
    await withTenantDb(ctx, (tx) => markInviteFailed(tx, approved.id))
    return { ...approved, status: 'invite_failed' }
  }
}

/**
 * Rejects a company-admin's pending invite request — deletes the row
 * outright (see `deletePendingUser`: there's nothing worth keeping, no
 * password/access was ever possible). Cross-tenant, same as
 * `approveInvite`.
 * @throws {NotPendingApprovalError} the user isn't awaiting approval
 */
export const rejectInvite = async (ctx: TenantContext, actor: ApprovalActor, userId: string): Promise<void> => {
  const pending = await withTenantDb(ctx, (tx) => getUserProfileById(tx, userId))
  if (!pending || pending.status !== 'pending_approval') {
    throw new NotPendingApprovalError(`User '${userId}' is not awaiting approval`)
  }

  const deleted = await withTenantDb(ctx, (tx) => deletePendingUser(tx, userId))
  if (!deleted) {
    throw new NotPendingApprovalError(`User '${userId}' is not awaiting approval`)
  }

  const auditActor = {
    actorType: 'user' as const,
    actorUserId: actor.actorUserId,
    actorCompanyId: actor.actorCompanyId,
    requestId: actor.requestId,
  }
  await withTenantDb(ctx, (tx) =>
    recordAuditEvent(tx, auditActor, pending.company.id, {
      action: 'user.invite.reject',
      resourceType: 'user',
      resourceId: userId,
      metadata: { email: pending.email },
    }),
  )
}

/** Lists every user currently awaiting super-admin approval, across all companies. */
export const listPendingApprovalUsers = (ctx: TenantContext): Promise<UserListRow[]> =>
  withTenantDb(ctx, (tx) => listUsers(tx, undefined, 'pending_approval'))
