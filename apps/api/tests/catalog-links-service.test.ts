process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, companies, createDb, roles, users, withSystemTransaction, type Db } from '@schuco/db'

import { getDb } from '../src/lib/db'
import {
  CatalogLinkNotFoundError,
  CatalogLinkValidationError,
  addLink,
  listLinks,
  removeLink,
} from '../src/services/catalog-links-service'

/** Service-layer test: the manufacturer → supplier/client catalog link rules. */

let db: Db
let manufacturerId: string
let supplierId: string
let clientId: string
let platformId: string
const superAdminCtx = { effectiveCompanyId: '', isSuperAdmin: true }
const actor = { actorUserId: '', actorCompanyId: '' }
const createdCompanyIds: string[] = []

beforeAll(async () => {
  db = getDb()
  await withSystemTransaction(db, async (tx) => {
    await tx
      .insert(roles)
      .values({ id: 'company-admin', name: 'Company Admin', description: 'test role' })
      .onConflictDoNothing({ target: roles.id })
    const make = async (values: Partial<typeof companies.$inferInsert> & { name: string; vatNumber: string }) => {
      const [row] = await tx.insert(companies).values(values).returning({ id: companies.id })
      createdCompanyIds.push(row.id)
      return row.id
    }
    platformId = await make({ isPlatform: true, name: 'Links Test Platform', vatNumber: 'LINKS-PLAT' })
    manufacturerId = await make({ isManufacturer: true, name: 'Links Test Manufacturer', vatNumber: 'LINKS-MAN' })
    supplierId = await make({ isSupplier: true, name: 'Links Test Supplier', vatNumber: 'LINKS-SUP' })
    clientId = await make({ isClient: true, name: 'Links Test Client', vatNumber: 'LINKS-CLI' })
    superAdminCtx.effectiveCompanyId = platformId
    actor.actorCompanyId = platformId
    const [user] = await tx
      .insert(users)
      .values({
        cognitoSub: 'links-test-super-admin',
        email: 'links-test-super-admin@example.com',
        companyId: platformId,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    actor.actorUserId = user.id
  })
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  const superuserDb = createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
  await superuserDb.delete(auditLog).where(inArray(auditLog.effectiveCompanyId, createdCompanyIds))
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(users).where(inArray(users.companyId, createdCompanyIds))
    await tx.delete(companies).where(inArray(companies.id, createdCompanyIds))
  })
})

describe('catalog links', () => {
  it('links a manufacturer to a supplier and to a client, idempotently, and lists them with names', async () => {
    await addLink(superAdminCtx, actor, manufacturerId, supplierId)
    await addLink(superAdminCtx, actor, manufacturerId, supplierId) // repeat is a no-op
    await addLink(superAdminCtx, actor, manufacturerId, clientId)

    const mine = (await listLinks(superAdminCtx)).filter((l) => l.manufacturerCompanyId === manufacturerId)
    expect(mine.map((l) => l.partnerName).sort()).toEqual(['Links Test Client', 'Links Test Supplier'])
    expect(mine[0].manufacturerName).toBe('Links Test Manufacturer')

    const created = await withSystemTransaction(db, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.effectiveCompanyId, manufacturerId), eq(auditLog.action, 'catalog_link.create'))),
    )
    expect(created).toHaveLength(2) // supplier + client; the repeat added nothing
  })

  it('rejects a source that is not a manufacturer, a partner that is neither supplier nor client, and a self-link', async () => {
    await expect(addLink(superAdminCtx, actor, supplierId, clientId)).rejects.toThrow(CatalogLinkValidationError)
    await expect(addLink(superAdminCtx, actor, manufacturerId, platformId)).rejects.toThrow(CatalogLinkValidationError)
    await expect(addLink(superAdminCtx, actor, manufacturerId, manufacturerId)).rejects.toThrow(CatalogLinkValidationError)
    await expect(
      addLink(superAdminCtx, actor, manufacturerId, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(CatalogLinkValidationError)
  })

  it('removes a link and reports a missing one', async () => {
    await removeLink(superAdminCtx, actor, manufacturerId, clientId)
    const left = (await listLinks(superAdminCtx)).filter((l) => l.manufacturerCompanyId === manufacturerId)
    expect(left.map((l) => l.partnerCompanyId)).toEqual([supplierId])
    await expect(removeLink(superAdminCtx, actor, manufacturerId, clientId)).rejects.toThrow(CatalogLinkNotFoundError)
  })
})
