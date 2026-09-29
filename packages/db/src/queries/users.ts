import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import type { Db, DbLike } from '../client'
import {
  businessUnits,
  companies,
  roles,
  userBusinessUnits,
  users,
} from '../schema'

export interface BusinessUnitScope {
  id: string
  name: string
  canEdit: boolean
}

export interface UserListRow {
  id: string
  cognitoSub: string | null
  email: string
  name: string | null
  status: 'invited' | 'invite_failed' | 'active' | 'inactive'
  role: {
    id: string
    name: string
  }
  company: {
    id: string
    name: string
    type: 'platform' | 'supplier' | 'client'
  }
  businessUnits: BusinessUnitScope[]
  createdAt: Date
  updatedAt: Date
}

export interface UserProfile {
  id: string
  cognitoSub: string | null
  email: string
  name: string | null
  status: 'invited' | 'invite_failed' | 'active' | 'inactive'
  role: {
    id: string
    name: string
    description: string
  }
  company: {
    id: string
    name: string
    type: 'platform' | 'supplier' | 'client'
    vatNumber: string
  }
  businessUnits: BusinessUnitScope[]
}

/**
 * Load full user profile with role, company, and business unit scopes.
 * @param db - Drizzle client
 * @param cognitoSub - Cognito subject claim
 */
const getUserProfileByWhere = async (
  db: DbLike,
  where: ReturnType<typeof eq>,
): Promise<UserProfile | null> => {
  const rows = await db
    .select({
      userId: users.id,
      cognitoSub: users.cognitoSub,
      email: users.email,
      name: users.name,
      status: users.status,
      roleId: roles.id,
      roleName: roles.name,
      roleDescription: roles.description,
      companyId: companies.id,
      companyName: companies.name,
      companyType: companies.type,
      companyVat: companies.vatNumber,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(where)
    .limit(1)

  const row = rows[0]
  if (!row) {
    return null
  }

  const buRows = await db
    .select({
      id: businessUnits.id,
      name: businessUnits.name,
      canEdit: userBusinessUnits.canEdit,
    })
    .from(userBusinessUnits)
    .innerJoin(businessUnits, eq(userBusinessUnits.businessUnitId, businessUnits.id))
    .where(eq(userBusinessUnits.userId, row.userId))

  return {
    id: row.userId,
    cognitoSub: row.cognitoSub,
    email: row.email,
    name: row.name,
    status: row.status,
    role: {
      id: row.roleId,
      name: row.roleName,
      description: row.roleDescription,
    },
    company: {
      id: row.companyId,
      name: row.companyName,
      type: row.companyType,
      vatNumber: row.companyVat,
    },
    businessUnits: buRows,
  }
}

export const getUserProfileByCognitoSub = async (
  db: DbLike,
  cognitoSub: string,
): Promise<UserProfile | null> => getUserProfileByWhere(db, eq(users.cognitoSub, cognitoSub))

/**
 * Load full user profile by internal id — needed right after
 * admin-inviting a user, who has no cognito_sub yet (ADR 0004).
 * @param db - Drizzle client
 * @param id - Internal user UUID
 */
export const getUserProfileById = async (db: DbLike, id: string): Promise<UserProfile | null> =>
  getUserProfileByWhere(db, eq(users.id, id))

/**
 * Upsert user on first login (lazy Cognito sync).
 * @param db - Drizzle client
 * @param input - Cognito identity + optional seed email match
 */
export const syncUserFromCognito = async (
  db: DbLike,
  input: { cognitoSub: string; email: string; name?: string },
): Promise<UserProfile | null> => {
  const existing = await getUserProfileByCognitoSub(db, input.cognitoSub)
  if (existing) {
    if (input.name && !existing.name) {
      await db
        .update(users)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(users.cognitoSub, input.cognitoSub))
    }
    return getUserProfileByCognitoSub(db, input.cognitoSub)
  }

  const emailMatch = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email.toLowerCase()))
    .limit(1)

  if (emailMatch[0]) {
    const current = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, emailMatch[0].id))
      .limit(1)

    await db
      .update(users)
      .set({
        cognitoSub: input.cognitoSub,
        name: input.name ?? undefined,
        // Flip a pending invite to active on first login. 'invite_failed'
        // is still a pending invite — it only means the Cognito call errored
        // client-side after actually succeeding, so a real login here proves
        // the identity exists and should recover the account. Never touch an
        // explicitly 'inactive' user — a stale token shouldn't reactivate them.
        ...(current[0]?.status === 'invited' || current[0]?.status === 'invite_failed'
          ? { status: 'active' as const }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, emailMatch[0].id))
    return getUserProfileByCognitoSub(db, input.cognitoSub)
  }

  return null
}

export interface CreateInvitedUserInput {
  email: string
  name?: string | null
  companyId: string
  roleId: string
  businessUnitIds?: string[]
}

/**
 * Create the DB grant for an admin-invited user (ADR 0004) — status
 * 'invited', cognito_sub NULL. This is the authoritative step; the
 * Cognito call happens after and separately (see
 * `../../apps/api/src/lib/cognito-admin.ts`), never before — a failure
 * there only ever leaves "a DB grant with no matching Cognito identity
 * yet," never an orphaned Cognito identity with no DB record.
 * @param db - RLS-scoped transaction (the caller's own company, or the
 *   super-admin cross-tenant path)
 * @param input - Invitee details
 */
export const createInvitedUser = async (
  db: DbLike,
  input: CreateInvitedUserInput,
): Promise<UserProfile> => {
  const [inserted] = await db
    .insert(users)
    .values({
      cognitoSub: null,
      email: input.email.toLowerCase(),
      name: input.name ?? null,
      companyId: input.companyId,
      roleId: input.roleId,
      status: 'invited',
    })
    .returning({ id: users.id })

  if (input.businessUnitIds?.length) {
    await db.insert(userBusinessUnits).values(
      input.businessUnitIds.map((businessUnitId) => ({
        userId: inserted.id,
        businessUnitId,
        canEdit: false,
      })),
    )
  }

  const profile = await getUserProfileById(db, inserted.id)
  if (!profile) {
    throw new Error('Failed to load newly-invited user profile')
  }
  return profile
}

/**
 * Mark an invite as failed after the Cognito call errors — a distinct,
 * queryable, retryable state, never left silently as 'invited' forever
 * (ADR 0004's reconciliation strategy).
 * @param db - RLS-scoped transaction
 * @param userId - The invited user's internal id
 */
export const markInviteFailed = async (db: DbLike, userId: string): Promise<void> => {
  await db
    .update(users)
    .set({ status: 'invite_failed', updatedAt: new Date() })
    .where(eq(users.id, userId))
}

export interface ExistingInviteRow {
  id: string
  status: 'invited' | 'invite_failed' | 'active' | 'inactive'
}

/**
 * Look up an existing user by email within a company, for invite-retry vs.
 * duplicate detection (ADR 0004): `email` is globally unique, so a second
 * invite to the same address must either resume a still-pending invite
 * (`'invited'`/`'invite_failed'`) or be rejected as a conflict — never
 * silently insert and hit the unique constraint.
 * @param db - RLS-scoped transaction
 * @param companyId - Company the invite is being created in
 * @param email - Invitee email (case-insensitive, matches storage)
 */
export const getUserByEmailInCompany = async (
  db: DbLike,
  companyId: string,
  email: string,
): Promise<ExistingInviteRow | null> => {
  const rows = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(and(eq(users.companyId, companyId), eq(users.email, email.toLowerCase())))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Reset a user's status back to `'invited'` — used when retrying a Cognito
 * invite for a row that's already `'invited'` or `'invite_failed'`, after
 * `createCognitoInvite` succeeds.
 * @param db - RLS-scoped transaction
 * @param userId - The invited user's internal id
 */
export const resetInvitePending = async (db: DbLike, userId: string): Promise<void> => {
  await db.update(users).set({ status: 'invited', updatedAt: new Date() }).where(eq(users.id, userId))
}

/**
 * List users visible under current RLS context (tenant or cross-tenant for
 * super-admin). Pass `companyId` to additionally narrow to one company —
 * required for the tenant-scoped /api/users route: RLS alone can't narrow
 * a super-admin's view (its policies are `is_super_admin() OR ...`, so a
 * super-admin sees every row regardless of X-Tenant-Id unless the query
 * itself filters by the effective company id too; see ADR 0007).
 * @param db - Drizzle client or RLS-scoped transaction
 * @param companyId - Optional explicit company filter, on top of RLS
 */
export const listUsers = async (db: DbLike, companyId?: string): Promise<UserListRow[]> => {
  const userRows = await db
    .select({
      userId: users.id,
      cognitoSub: users.cognitoSub,
      email: users.email,
      name: users.name,
      status: users.status,
      roleId: roles.id,
      roleName: roles.name,
      companyId: companies.id,
      companyName: companies.name,
      companyType: companies.type,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(companyId ? eq(users.companyId, companyId) : undefined)
    .orderBy(asc(users.email))

  if (userRows.length === 0) {
    return []
  }

  const userIds = userRows.map((row) => row.userId)
  const buRows = await db
    .select({
      userId: userBusinessUnits.userId,
      id: businessUnits.id,
      name: businessUnits.name,
      canEdit: userBusinessUnits.canEdit,
    })
    .from(userBusinessUnits)
    .innerJoin(businessUnits, eq(userBusinessUnits.businessUnitId, businessUnits.id))
    .where(inArray(userBusinessUnits.userId, userIds))

  const businessUnitsByUser = new Map<string, BusinessUnitScope[]>()
  for (const bu of buRows) {
    const existing = businessUnitsByUser.get(bu.userId) ?? []
    existing.push({ id: bu.id, name: bu.name, canEdit: bu.canEdit })
    businessUnitsByUser.set(bu.userId, existing)
  }

  return userRows.map((row) => ({
    id: row.userId,
    cognitoSub: row.cognitoSub,
    email: row.email,
    name: row.name,
    status: row.status,
    role: {
      id: row.roleId,
      name: row.roleName,
    },
    company: {
      id: row.companyId,
      name: row.companyName,
      type: row.companyType,
    },
    businessUnits: businessUnitsByUser.get(row.userId) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

/**
 * Run `fn` inside a short-lived, tenant-scoped transaction with RLS session
 * variables set for its duration. `set_config(..., true)` is
 * transaction-local, so the GUCs only stay meaningful when every query —
 * including the ones that set them — shares the same pinned connection,
 * which `db.transaction()` guarantees and a pooled `db.execute()` call does
 * not.
 *
 * Scope this to one logical unit of DB work (a route's queries), never to
 * an HTTP request's full lifetime — a transaction held across external I/O
 * (an API call, a file upload, PDF rendering) holds a pooled connection for
 * however long that I/O takes. See ADR 0006. For the narrow, genuinely
 * system-level case where no tenant is known yet (identity bootstrap), use
 * `withSystemTransaction` instead, not this function with a fabricated
 * `companyId` — see ADR 0007.
 * @param db - Drizzle client (top-level, pooled)
 * @param ctx - RLS context for the transaction
 * @param fn - Work to run with RLS enforced; receives the transaction handle
 */
export const withRlsTransaction = async <T>(
  db: Db,
  ctx: { companyId: string; isSuperAdmin: boolean },
  fn: (tx: DbLike) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_company_id', ${ctx.companyId}, true)`,
    )
    await tx.execute(
      sql`SELECT set_config('app.is_super_admin', ${ctx.isSuperAdmin ? 'true' : 'false'}, true)`,
    )
    return fn(tx)
  })

/**
 * Run `fn` inside a short-lived, system-level transaction — RLS's
 * `app_is_super_admin()` GUC is set `true`, `app_current_company_id()` is
 * left unset (NULL), because no tenant is known or relevant. This is
 * distinct from `withRlsTransaction` on purpose: "bypass tenant
 * restriction for a genuine system operation" and "RLS transaction scoped
 * to a company that happens to be an empty string" are different things,
 * and conflating them was a design smell worth naming out of existence
 * (see ADR 0007). Use only for narrowly-scoped, explicitly-named system
 * operations — e.g. resolving a caller's identity before their tenant is
 * known, or a super-admin's target-company existence check.
 * @param db - Drizzle client (top-level, pooled)
 * @param fn - Work to run with the super-admin RLS bypass active
 */
export const withSystemTransaction = async <T>(
  db: Db,
  fn: (tx: DbLike) => Promise<T>,
): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.is_super_admin', 'true', true)`)
    return fn(tx)
  })
