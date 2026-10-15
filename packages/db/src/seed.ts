import { eq } from 'drizzle-orm'

import type { Db } from './client'
import { DEMO_USER_SEEDS, type DemoBusinessUnitKey, type DemoCompanyKey } from './demo-users'
import {
  businessUnits,
  companies,
  roles,
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

const COMPANY_SEEDS: Array<{
  key: DemoCompanyKey
  isPlatform?: boolean
  isManufacturer?: boolean
  isSupplier?: boolean
  isClient?: boolean
  name: string
  vatNumber: string
}> = [
  { key: 'schuco', isPlatform: true, name: 'Schüco / PREVIO Platform', vatNumber: 'IT00000000001' },
  { key: 'suppli', isManufacturer: true, isSupplier: true, name: 'Suppli S.r.l.', vatNumber: 'IT12345678901' },
  { key: 'technometal', isClient: true, name: 'Technometal S.p.A.', vatNumber: 'IT98765432109' },
  { key: 'fabbrikka', isClient: true, name: 'Fabbrikka S.r.l.', vatNumber: 'IT11223344556' },
]

const BUSINESS_UNIT_SEEDS: Array<{
  key: DemoBusinessUnitKey
  companyKey: DemoCompanyKey
  name: string
  address: string
}> = [
  { key: 'schuco_hq', companyKey: 'schuco', name: 'Schuco HQ', address: 'Via dell\'Innovazione 1, Milano' },
  { key: 'suppli_hq', companyKey: 'suppli', name: 'Suppli HQ', address: 'Via Industria 5, Bergamo' },
  { key: 'technometal_a', companyKey: 'technometal', name: 'Technometal_A', address: 'Via Roma 10, Milano' },
  { key: 'technometal_b', companyKey: 'technometal', name: 'Technometal_B', address: 'Via Torino 20, Torino' },
  { key: 'fabbrikka_hq', companyKey: 'fabbrikka', name: 'Fabbrikka HQ', address: 'Via Artigiani 3, Verona' },
]

/**
 * Seed Phase 1 RBAC demo data (idempotent).
 * @param db - Drizzle database client
 */
export const seedDatabase = async (db: Db): Promise<void> => {
  for (const role of CANONICAL_ROLES) {
    await db.insert(roles).values(role).onConflictDoNothing({ target: roles.id })
  }

  const companyIds = new Map<DemoCompanyKey, string>()
  for (const company of COMPANY_SEEDS) {
    const existing = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.vatNumber, company.vatNumber))
      .limit(1)

    if (existing[0]) {
      companyIds.set(company.key, existing[0].id)
      continue
    }

    const [created] = await db
      .insert(companies)
      .values({
        isPlatform: company.isPlatform ?? false,
        isManufacturer: company.isManufacturer ?? false,
        isSupplier: company.isSupplier ?? false,
        isClient: company.isClient ?? false,
        name: company.name,
        vatNumber: company.vatNumber,
      })
      .returning({ id: companies.id })

    companyIds.set(company.key, created.id)
  }

  const businessUnitIds = new Map<DemoBusinessUnitKey, string>()
  for (const unit of BUSINESS_UNIT_SEEDS) {
    const companyId = companyIds.get(unit.companyKey)
    if (!companyId) {
      continue
    }

    const existing = await db
      .select({ id: businessUnits.id })
      .from(businessUnits)
      .where(eq(businessUnits.name, unit.name))
      .limit(1)

    if (existing[0]) {
      businessUnitIds.set(unit.key, existing[0].id)
      continue
    }

    const [created] = await db
      .insert(businessUnits)
      .values({
        companyId,
        name: unit.name,
        address: unit.address,
      })
      .returning({ id: businessUnits.id })

    businessUnitIds.set(unit.key, created.id)
  }

  for (const demoUser of DEMO_USER_SEEDS) {
    const companyId = companyIds.get(demoUser.companyKey)
    if (!companyId) {
      continue
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, demoUser.email))
      .limit(1)

    let userId = existing[0]?.id

    if (userId) {
      await db
        .update(users)
        .set({
          cognitoSub: demoUser.cognitoSub,
          name: demoUser.name,
          companyId,
          roleId: demoUser.roleId,
          status: demoUser.status,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
    } else {
      const [created] = await db
        .insert(users)
        .values({
          cognitoSub: demoUser.cognitoSub,
          email: demoUser.email,
          name: demoUser.name,
          companyId,
          roleId: demoUser.roleId,
          status: demoUser.status,
        })
        .returning({ id: users.id })

      userId = created.id
    }

    for (const buKey of demoUser.businessUnits) {
      const businessUnitId = businessUnitIds.get(buKey)
      if (!businessUnitId) {
        continue
      }

      await db
        .insert(userBusinessUnits)
        .values({
          userId,
          businessUnitId,
          canEdit: demoUser.editBusinessUnits.includes(buKey),
        })
        .onConflictDoUpdate({
          target: [userBusinessUnits.userId, userBusinessUnits.businessUnitId],
          set: { canEdit: demoUser.editBusinessUnits.includes(buKey) },
        })
    }
  }
}
