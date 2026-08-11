import { eq, sql } from 'drizzle-orm'

import type { Db } from '../client'
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

export interface UserProfile {
  id: string
  cognitoSub: string
  email: string
  name: string | null
  status: 'active' | 'inactive'
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
export const getUserProfileByCognitoSub = async (
  db: Db,
  cognitoSub: string,
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
    .where(eq(users.cognitoSub, cognitoSub))
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

/**
 * Upsert user on first login (lazy Cognito sync).
 * @param db - Drizzle client
 * @param input - Cognito identity + optional seed email match
 */
export const syncUserFromCognito = async (
  db: Db,
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
    await db
      .update(users)
      .set({
        cognitoSub: input.cognitoSub,
        name: input.name ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, emailMatch[0].id))
    return getUserProfileByCognitoSub(db, input.cognitoSub)
  }

  return null
}

/**
 * Set Postgres session variables for RLS policies.
 * @param db - Drizzle client
 * @param companyId - Tenant company UUID
 * @param isSuperAdmin - Whether user is platform super-admin
 */
export const setRlsContext = async (
  db: Db,
  companyId: string,
  isSuperAdmin: boolean,
): Promise<void> => {
  await db.execute(
    sql`SELECT set_config('app.current_company_id', ${companyId}, true)`,
  )
  await db.execute(
    sql`SELECT set_config('app.is_super_admin', ${isSuperAdmin ? 'true' : 'false'}, true)`,
  )
}
