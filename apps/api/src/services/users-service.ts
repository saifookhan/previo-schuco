import {
  createInvitedUser,
  filterBusinessUnitIdsByCompany,
  listUsers,
  markInviteFailed,
  type UserListRow,
  type UserProfile,
} from '@schuco/db'

import { createCognitoInvite } from '../lib/cognito-admin'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { recordAuditEvent } from './audit-service'

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
}

/**
 * Invite a user into `companyId` (ADR 0004). The DB grant is created and
 * committed first — it's authoritative; the Cognito call happens after,
 * separately, so a failure there only ever leaves "a DB grant with no
 * Cognito identity yet" (queryable as `status: 'invite_failed'`), never
 * an orphaned Cognito identity with no DB record.
 *
 * Callers: the company-admin route forces `companyId` to the caller's
 * own company; the super-admin route takes it explicitly from the
 * request body. Neither ever comes from a URL path (ADR 0001).
 * @param ctx - Tenant context resolved by `requireAuth`
 * @param actor - Who's inviting, for the audit record
 * @param companyId - Company the invited user belongs to
 * @param input - Invitee details
 */
export const inviteUser = async (
  ctx: TenantContext,
  actor: InviteActor,
  companyId: string,
  input: InviteUserInput,
): Promise<UserProfile> => {
  const validBusinessUnitIds = input.businessUnitIds?.length
    ? await withTenantDb(ctx, (tx) =>
        filterBusinessUnitIdsByCompany(tx, companyId, input.businessUnitIds!),
      )
    : []

  const created = await withTenantDb(ctx, async (tx) => {
    const profile = await createInvitedUser(tx, {
      email: input.email,
      name: input.name,
      companyId,
      roleId: input.roleId,
      businessUnitIds: validBusinessUnitIds,
    })
    await recordAuditEvent(
      tx,
      { actorType: 'user', actorUserId: actor.actorUserId, actorCompanyId: actor.actorCompanyId },
      companyId,
      {
        action: 'user.invite',
        resourceType: 'user',
        resourceId: profile.id,
        metadata: { email: input.email, roleId: input.roleId },
      },
    )
    return profile
  })

  try {
    const result = await createCognitoInvite(input.email)
    if (result.outcome === 'skipped-dev-bypass') {
      // eslint-disable-next-line no-console
      console.warn(
        `[usersService.inviteUser] Cognito not configured — DB row created for ${input.email}, no invite email sent (dev bypass).`,
      )
    }
    return created
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[usersService.inviteUser] Cognito invite failed for ${input.email}:`, error)
    await withTenantDb(ctx, (tx) => markInviteFailed(tx, created.id))
    return { ...created, status: 'invite_failed' }
  }
}
