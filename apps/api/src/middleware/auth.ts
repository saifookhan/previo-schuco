import type { Context, Next } from 'hono'
import { computePermissions, type Permission } from '@schuco/contracts'
import { getCompanyById, getUserProfileByCognitoSub, getUserProfileById, withSystemTransaction, type UserProfile } from '@schuco/db'

import { isDevLoginAllowed } from '@schuco/env/dev-login'

import { getDb } from '../lib/db'
import { isUuid } from '../lib/uuid'
import type { RequestVariables } from './request-context'
import { getEffectiveRolePermissions } from '../services/role-permissions-service'
import { parseBearerToken, verifySessionJwt } from '../lib/session-jwt'

export type AuthVariables = RequestVariables & {
  user: UserProfile
  actorUserId: string
  effectiveCompanyId: string
  isSuperAdmin: boolean
  isActingAsTenant: boolean
}

const DEV_SUB_HEADER = 'x-dev-user-sub'
const TENANT_OVERRIDE_HEADER = 'x-tenant-id'


/**
 * Resolve dev-mode user sub (the seeded demo users — see demo-users.ts).
 * Same switch as POST /api/auth/dev-login: `ALLOW_DEV_LOGIN=true`.
 * `NODE_ENV` is not a switch — a non-production process must not accept
 * the header just because it isn't production.
 * @param c - Hono context
 */
const resolveDevSub = (c: Context): string | null => {
  if (!isDevLoginAllowed()) {
    return null
  }

  return c.req.header(DEV_SUB_HEADER) ?? null
}

/**
 * Require authenticated user via our own session JWT (see
 * apps/web's lib/auth/session.ts — same `AUTH_SECRET`, verified here
 * with `verifySessionJwt`) or the dev header. Resolves identity and
 * tenant context onto the Hono context as plain data — `actorUserId`,
 * `effectiveCompanyId`, `isSuperAdmin`, `isActingAsTenant` — and holds NO
 * database transaction across `next()`. Route handlers open their own
 * short, tenant-scoped transaction via `withTenantDb(c, fn)` (see
 * `../lib/tenant-db`) for whatever DB work they actually need; a
 * transaction's lifetime must never be tied to the request's lifetime
 * (see ADR 0006 — a Resend call, file upload, or PDF render inside a
 * request-long transaction would hold a pooled connection for however
 * long that non-DB work takes).
 *
 * A super-admin may act on behalf of another company via the `X-Tenant-Id`
 * header; any other caller sending it is rejected (see ADR 0008).
 */
export const requireAuth = async (c: Context, next: Next): Promise<Response | void> => {
  const db = getDb()
  let profile: UserProfile | null = null

  const bearerToken = parseBearerToken(c.req.header('Authorization'))
  if (bearerToken) {
    const payload = await verifySessionJwt(bearerToken)
    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401)
    }
    // Identity resolution (JWT sub -> profile) necessarily runs before we
    // know the caller's company_id, so it can't be scoped by that
    // company's RLS policy yet. This is a genuine system-level operation
    // (see ADR 0007), not the caller's own tenant-scoped work — a short,
    // self-contained transaction, not the request transaction (there
    // isn't one anymore) and not the raw pooled `db` (which the
    // restricted app DB role can't read from at all under RLS with no
    // GUCs set).
    profile = await withSystemTransaction(db, (tx) => getUserProfileById(tx, payload.sub))
  } else {
    const devSub = resolveDevSub(c)
    if (!devSub) {
      return c.json({ error: 'Unauthorized — set Authorization Bearer or X-Dev-User-Sub' }, 401)
    }
    profile = await withSystemTransaction(db, (tx) => getUserProfileByCognitoSub(tx, devSub))
  }

  if (!profile) {
    return c.json({ error: 'User not provisioned in PREVIO' }, 403)
  }

  if (profile.status !== 'active') {
    return c.json({ error: 'User account inactive' }, 403)
  }
  if (!profile.company.isActive) {
    return c.json({ error: 'Company account deactivated' }, 403)
  }

  const isSuperAdmin = profile.roles.some((r) => r.id === 'super-admin')
  const tenantOverride = c.req.header(TENANT_OVERRIDE_HEADER)

  if (tenantOverride) {
    // Role check first — a non-super-admin gets the same 403 whether the
    // value is well-formed or not, so the response never confirms/denies
    // whether a given company id exists.
    if (!isSuperAdmin) {
      return c.json({ error: `Forbidden — ${TENANT_OVERRIDE_HEADER} is restricted to super-admin` }, 403)
    }
    if (!isUuid(tenantOverride)) {
      return c.json({ error: `Invalid ${TENANT_OVERRIDE_HEADER}` }, 400)
    }

    const target = await withSystemTransaction(db, (tx) => getCompanyById(tx, tenantOverride))
    if (!target) {
      return c.json({ error: `Unknown company for ${TENANT_OVERRIDE_HEADER}` }, 404)
    }
  }

  c.set('user', profile)
  c.set('actorUserId', profile.id)
  c.set('effectiveCompanyId', tenantOverride ?? profile.company.id)
  c.set('isSuperAdmin', isSuperAdmin)
  c.set('isActingAsTenant', Boolean(tenantOverride))
  // Normally already set by the app-wide `requestContext`; routers mounted without it (tests) still get one.
  if (!c.get('requestId')) {
    c.set('requestId', crypto.randomUUID())
  }

  await next()
}

/**
 * Require minimum role level for protected routes. Runs after
 * `requireAuth` and before any route handler's DB access — RBAC/action
 * authorization is a separate concern from RLS tenant isolation, checked
 * here, not folded into or inferred from what RLS happens to allow a query
 * to return (see ADR 0006).
 * A user holding several roles passes if ANY of them is allowed.
 * @param allowedRoles - Role IDs permitted to access the route
 */
export const requireRoles = (allowedRoles: string[]) =>
  async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user') as UserProfile | undefined
    if (!user || !user.roles.some((r) => allowedRoles.includes(r.id))) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }

/**
 * Require an effective permission (role grants it AND the company's
 * capabilities unlock it — see `computePermissions`). Preferred over
 * `requireRoles` for anything gated by what a company can do.
 * @param permission - The permission the route needs
 */
export const requirePermission = (permission: Permission) =>
  async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user') as UserProfile | undefined
    if (!user) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    const matrix = await getEffectiveRolePermissions()
    if (!computePermissions(user.roles.map((r) => r.id), user.company.capabilities, matrix).includes(permission)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
