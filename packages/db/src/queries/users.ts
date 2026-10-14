import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import type { Db, DbLike } from '../client'
import { capabilitiesOf, type CompanyCapabilities } from './companies'
import {
  businessUnits,
  companies,
  roles,
  userBusinessUnits,
  users,
} from '../schema'

export type UserStatus = 'pending_approval' | 'invited' | 'invite_failed' | 'active' | 'inactive'

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
  status: UserStatus
  role: {
    id: string
    name: string
  }
  company: {
    id: string
    name: string
    capabilities: CompanyCapabilities
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
  status: UserStatus
  role: {
    id: string
    name: string
    description: string
  }
  company: {
    id: string
    name: string
    capabilities: CompanyCapabilities
    vatNumber: string
    isActive: boolean
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
      companyIsPlatform: companies.isPlatform,
      companyIsManufacturer: companies.isManufacturer,
      companyIsSupplier: companies.isSupplier,
      companyIsClient: companies.isClient,
      companyVat: companies.vatNumber,
      companyIsActive: companies.isActive,
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
      capabilities: capabilitiesOf({
        isPlatform: row.companyIsPlatform,
        isManufacturer: row.companyIsManufacturer,
        isSupplier: row.companyIsSupplier,
        isClient: row.companyIsClient,
      }),
      vatNumber: row.companyVat,
      isActive: row.companyIsActive,
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
  /**
   * 'invited' (default) — an invite-accept email goes out immediately
   * (super-admin invites, and any invite that doesn't need approval).
   * 'pending_approval' — a company-admin's own invite (Stage 3): the row
   * exists, but no email is sent and no password can be set until a
   * super-admin approves it (see approveUser/deletePendingUser below).
   */
  initialStatus?: 'invited' | 'pending_approval'
}

/**
 * Create the DB grant for an admin-invited (or pending-approval) user
 * (ADR 0004), cognito_sub NULL. This is the authoritative step; the
 * invite email happens after and separately (see auth-service.ts's
 * `issueInviteToken`), never before — a failure there only ever leaves
 * "a DB grant with no invite email sent yet," never a sent email with
 * no DB record.
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
      status: input.initialStatus ?? 'invited',
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

/**
 * Approves a pending-approval user — transitions `'pending_approval'` ->
 * `'invited'`, clearing the way for `issueInviteToken` to actually send
 * the invite email. A no-op (returns null) if the row isn't currently
 * `'pending_approval'` — an already-approved or already-active user
 * can't be "approved" again.
 * @param db - System transaction (super-admin action, cross-tenant)
 * @param userId - The pending user's internal id
 */
export const approveUser = async (db: DbLike, userId: string): Promise<UserProfile | null> => {
  const [updated] = await db
    .update(users)
    .set({ status: 'invited', updatedAt: new Date() })
    .where(and(eq(users.id, userId), eq(users.status, 'pending_approval')))
    .returning({ id: users.id })
  if (!updated) {
    return null
  }
  return getUserProfileById(db, updated.id)
}

/**
 * Rejects a pending-approval user by deleting the row outright — there's
 * nothing worth keeping (no password, no invite ever sent, no activity
 * possible). Scoped to `status = 'pending_approval'` in the WHERE
 * itself so this can never delete an active/invited/inactive user by
 * mistake, however it's called.
 * @param db - System transaction (super-admin action, cross-tenant)
 * @param userId - The pending user's internal id
 * @returns Whether a row was actually deleted
 */
export const deletePendingUser = async (db: DbLike, userId: string): Promise<boolean> => {
  const deleted = await db
    .delete(users)
    .where(and(eq(users.id, userId), eq(users.status, 'pending_approval')))
    .returning({ id: users.id })
  return deleted.length > 0
}

export interface ExistingInviteRow {
  id: string
  status: UserStatus
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
 * Reset a user's status back to `'invited'` — used when retrying the
 * invite email for a row that's already `'invited'` or `'invite_failed'`,
 * after `issueInviteToken` succeeds.
 * @param db - RLS-scoped transaction
 * @param userId - The invited user's internal id
 */
export const resetInvitePending = async (db: DbLike, userId: string): Promise<void> => {
  await db.update(users).set({ status: 'invited', updatedAt: new Date() }).where(eq(users.id, userId))
}

export interface UserAuthRow {
  id: string
  email: string
  passwordHash: string | null
  status: UserStatus
}

/**
 * Look up a user by email, globally (not company-scoped) — needed for
 * login, which by definition runs before the caller's company is known.
 * Call inside `withSystemTransaction`, same as identity resolution in
 * `requireAuth`. Returns the password hash so the caller can verify it
 * without a second round trip; never return this row to a client as-is.
 * @param db - System transaction
 * @param email - Case-insensitive, matches storage
 */
export const getUserByEmail = async (db: DbLike, email: string): Promise<UserAuthRow | null> => {
  const rows = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Sets a user's password hash — accepting an invite (first password) or
 * completing a forgotten-password reset. Also flips a still-pending
 * invite to `'active'`: setting a password *is* what accepting an invite
 * means, so there's no separate "activate" step. Never touches an
 * explicitly `'inactive'` user's status (a reset link doesn't undo an
 * admin's deactivation).
 * @param db - System transaction
 * @param userId - Whose password this is
 * @param passwordHash - Already-hashed (bcrypt) — never a plaintext password
 */
export const setUserPassword = async (db: DbLike, userId: string, passwordHash: string): Promise<void> => {
  const [current] = await db.select({ status: users.status }).from(users).where(eq(users.id, userId)).limit(1)
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
      ...(current?.status === 'invited' || current?.status === 'invite_failed' ? { status: 'active' as const } : {}),
    })
    .where(eq(users.id, userId))
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
export const listUsers = async (db: DbLike, companyId?: string, status?: UserStatus): Promise<UserListRow[]> => {
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
      companyIsPlatform: companies.isPlatform,
      companyIsManufacturer: companies.isManufacturer,
      companyIsSupplier: companies.isSupplier,
      companyIsClient: companies.isClient,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .innerJoin(companies, eq(users.companyId, companies.id))
    .where(
      and(
        companyId ? eq(users.companyId, companyId) : undefined,
        status ? eq(users.status, status) : undefined,
      ),
    )
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
      capabilities: capabilitiesOf({
        isPlatform: row.companyIsPlatform,
        isManufacturer: row.companyIsManufacturer,
        isSupplier: row.companyIsSupplier,
        isClient: row.companyIsClient,
      }),
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
