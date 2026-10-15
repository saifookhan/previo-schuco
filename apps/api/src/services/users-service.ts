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
  setUserRoles,
  type UserListRow,
  type UserProfile,
} from '@schuco/db'

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
  const knownRoles = new Set((await withTenantDb(ctx, (tx) => listAllRoles(tx))).map((role) => role.id))
  const unknownRole = input.roleIds.find((id) => !knownRoles.has(id))
  if (unknownRole) {
    throw new UnknownRoleError(`Unknown role '${unknownRole}'`)
  }
  if (
    !canGrantRoles(actor.callerRoleIds, input.roleIds) ||
    !canGrantByPermissions(actor.callerRoleIds, input.roleIds, await getEffectiveRolePermissions())
  ) {
    throw new RoleNotGrantableError(
      `'${actor.callerRoleIds.join(', ')}' cannot assign role(s) '${input.roleIds.join(', ')}'`,
    )
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
    // eslint-disable-next-line no-console
    console.error(`[usersService.inviteUser] Invite email failed for ${input.email}:`, error)
    await withTenantDb(ctx, (tx) => markInviteFailed(tx, created.id))
    return { ...created, status: 'invite_failed' }
  }
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
    // eslint-disable-next-line no-console
    console.error(`[usersService.approveInvite] Invite email failed for ${approved.email}:`, error)
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
