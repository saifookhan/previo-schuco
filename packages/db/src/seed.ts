import { eq } from 'drizzle-orm'

import type { Db } from './client'
import {
  businessUnits,
  companies,
  roles,
  supplierClientLinks,
  userBusinessUnits,
  users,
} from './schema'

/** Canonical role definitions for seeding. */
export const CANONICAL_ROLES = [
  {
    id: 'super-admin',
    name: 'Super Admin',
    description: 'PREVIO / Schuco platform operators with cross-tenant access',
  },
  {
    id: 'company-admin',
    name: 'Company Admin',
    description: 'Manages company settings, users, and product visibility',
  },
  {
    id: 'super-user',
    name: 'Super User (Sales Manager)',
    description: 'Sales coordinator — team offers within scoped business units',
  },
  {
    id: 'user',
    name: 'User (Sales Associate)',
    description: 'Standard sales staff — own offers only',
  },
] as const

/**
 * Seed Phase 1 RBAC demo data (idempotent).
 * @param db - Drizzle database client
 */
export const seedDatabase = async (db: Db): Promise<void> => {
  for (const role of CANONICAL_ROLES) {
    await db
      .insert(roles)
      .values(role)
      .onConflictDoNothing({ target: roles.id })
  }

  const existingSchuco = await db
    .select()
    .from(companies)
    .where(eq(companies.vatNumber, 'IT00000000001'))
    .limit(1)

  if (existingSchuco.length > 0) {
    return
  }

  const [schuco] = await db
    .insert(companies)
    .values({
      type: 'platform',
      name: 'Schüco / PREVIO Platform',
      vatNumber: 'IT00000000001',
    })
    .returning()

  const [suppli] = await db
    .insert(companies)
    .values({
      type: 'supplier',
      name: 'Suppli S.r.l.',
      vatNumber: 'IT12345678901',
    })
    .returning()

  const [technometal] = await db
    .insert(companies)
    .values({
      type: 'client',
      name: 'Technometal S.p.A.',
      vatNumber: 'IT98765432109',
    })
    .returning()

  const [fabbrikka] = await db
    .insert(companies)
    .values({
      type: 'client',
      name: 'Fabbrikka S.r.l.',
      vatNumber: 'IT11223344556',
    })
    .returning()

  const [schucoBu] = await db
    .insert(businessUnits)
    .values({
      companyId: schuco.id,
      name: 'Schuco HQ',
      address: 'Via dell\'Innovazione 1, Milano',
    })
    .returning()

  const [technoA] = await db
    .insert(businessUnits)
    .values({
      companyId: technometal.id,
      name: 'Technometal_A',
      address: 'Via Roma 10, Milano',
    })
    .returning()

  const [technoB] = await db
    .insert(businessUnits)
    .values({
      companyId: technometal.id,
      name: 'Technometal_B',
      address: 'Via Torino 20, Torino',
    })
    .returning()

  await db.insert(supplierClientLinks).values([
    { supplierCompanyId: schuco.id, clientCompanyId: fabbrikka.id },
    { supplierCompanyId: suppli.id, clientCompanyId: fabbrikka.id },
    { supplierCompanyId: suppli.id, clientCompanyId: technometal.id },
  ])

  const [demoAdmin] = await db
    .insert(users)
    .values({
      cognitoSub: 'seed-super-admin',
      email: 'admin@schuco-demo.it',
      name: 'Anna Bianchi',
      companyId: schuco.id,
      roleId: 'super-admin',
      status: 'active',
    })
    .returning()

  await db.insert(users).values({
    cognitoSub: 'seed-company-admin',
    email: 'admin@technometal-demo.it',
    name: 'Luca Verdi',
    companyId: technometal.id,
    roleId: 'company-admin',
    status: 'active',
  })

  const [demoSuperUser] = await db
    .insert(users)
    .values({
      cognitoSub: 'seed-super-user',
      email: 'manager@technometal-demo.it',
      name: 'Giulia Neri',
      companyId: technometal.id,
      roleId: 'super-user',
      status: 'active',
    })
    .returning()

  await db.insert(users).values({
    cognitoSub: 'seed-user',
    email: 'sales@technometal-demo.it',
    name: 'Marco Rossi',
    companyId: technometal.id,
    roleId: 'user',
    status: 'active',
  })

  await db.insert(userBusinessUnits).values([
    { userId: demoAdmin.id, businessUnitId: schucoBu.id, canEdit: true },
    { userId: demoSuperUser.id, businessUnitId: technoA.id, canEdit: false },
    { userId: demoSuperUser.id, businessUnitId: technoB.id, canEdit: true },
  ])
}
