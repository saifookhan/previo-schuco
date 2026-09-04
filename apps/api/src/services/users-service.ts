import { listUsers, type UserListRow } from '@schuco/db'

import { withTenantDb, type TenantContext } from '../lib/tenant-db'

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
