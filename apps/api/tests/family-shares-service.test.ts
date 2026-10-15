process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditLog,
  companies,
  createDb,
  productFamilies,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'

import { getDb } from '../src/lib/db'
import { listProductFamilies } from '../src/services/product-families-service'
import {
  FamilyShareNotFoundError,
  FamilyShareValidationError,
  getFamilyShareDiscount,
  getFamilyShares,
  updateFamilyShares,
} from '../src/services/family-shares-service'

/** Service-layer test: sharing a product family (and onward sharing) with per-company default discounts. */

let db: Db
let manufacturer: string
let supplier: string
let client: string
let outsider: string
let platformOnly: string
let familyId: string
let actorUserId: string
const createdCompanyIds: string[] = []
const ctxOf = (companyId: string) => ({ effectiveCompanyId: companyId, isSuperAdmin: false })
const actorOf = (companyId: string) => ({ actorUserId, actorCompanyId: companyId })

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
    manufacturer = await make({ isManufacturer: true, name: 'Share Test Manufacturer', vatNumber: 'SHARE-MAN' })
    supplier = await make({ isSupplier: true, name: 'Share Test Supplier', vatNumber: 'SHARE-SUP' })
    client = await make({ isClient: true, name: 'Share Test Client', vatNumber: 'SHARE-CLI' })
    outsider = await make({ isClient: true, name: 'Share Test Outsider', vatNumber: 'SHARE-OUT' })
    platformOnly = await make({ isPlatform: true, name: 'Share Test Platform', vatNumber: 'SHARE-PLAT' })
    const [user] = await tx
      .insert(users)
      .values({
        cognitoSub: 'share-test-user',
        email: 'share-test-user@example.com',
        companyId: manufacturer,
        roleId: 'company-admin',
        status: 'active',
      })
      .returning({ id: users.id })
    actorUserId = user.id
    const [family] = await tx
      .insert(productFamilies)
      .values({ supplierCompanyId: manufacturer, name: 'Share Test Family', isPublished: true })
      .returning({ id: productFamilies.id })
    familyId = family.id
  })
})

afterAll(async () => {
  const superuserUrl = process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
  await createDb(superuserUrl.replace(/\/[^/]+$/, '/previo_test'))
    .delete(auditLog)
    .where(inArray(auditLog.effectiveCompanyId, createdCompanyIds))
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(productFamilies).where(eq(productFamilies.id, familyId))
    await tx.delete(users).where(inArray(users.companyId, createdCompanyIds))
    await tx.delete(companies).where(inArray(companies.id, createdCompanyIds))
  })
})

describe('family shares', () => {
  it('hides a shared family from recipients when it is unpublished, and shows it again when republished', async () => {
    const [fam] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(productFamilies)
        .values({ supplierCompanyId: manufacturer, name: 'Share Test Visibility', isPublished: true })
        .returning({ id: productFamilies.id }),
    )
    try {
      await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), fam.id, [{ companyId: client, discountPct: 7 }])
      const seenByClient = async () => (await listProductFamilies(ctxOf(client))).filter((f) => f.id === fam.id)

      const visible = await seenByClient()
      expect(visible).toHaveLength(1)
      expect(visible[0].ownerCompanyName).toBe('Share Test Manufacturer')
      expect(visible[0].shareDiscountPct).toBe(7)

      const setPublished = (isPublished: boolean) =>
        withSystemTransaction(db, (tx) => tx.update(productFamilies).set({ isPublished }).where(eq(productFamilies.id, fam.id)))
      await setPublished(false)
      expect(await seenByClient()).toHaveLength(0) // gone from "shared with me" the moment it is unpublished
      expect(await listProductFamilies(ctxOf(manufacturer))).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: fam.id })]), // the owner still sees its draft
      )

      await setPublished(true)
      expect(await seenByClient()).toHaveLength(1) // the share row was kept, so republishing restores it
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(productFamilies).where(eq(productFamilies.id, fam.id)))
    }
  })

  it('does not let a draft family be shared with new companies, but still lets existing shares be removed', async () => {
    const [draft] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(productFamilies)
        .values({ supplierCompanyId: manufacturer, name: 'Share Test Draft', isPublished: false })
        .returning({ id: productFamilies.id }),
    )
    try {
      await expect(
        updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [{ companyId: client, discountPct: 1 }]),
      ).rejects.toThrow(FamilyShareValidationError)

      // publish, share, then unpublish again: removing is still allowed, adding is not
      await withSystemTransaction(db, (tx) =>
        tx.update(productFamilies).set({ isPublished: true }).where(eq(productFamilies.id, draft.id)),
      )
      await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [
        { companyId: client, discountPct: 1 },
        { companyId: supplier, discountPct: 2 },
      ])
      await withSystemTransaction(db, (tx) =>
        tx.update(productFamilies).set({ isPublished: false }).where(eq(productFamilies.id, draft.id)),
      )
      const trimmed = await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [
        { companyId: client, discountPct: 1 },
      ])
      expect(trimmed.shares.map((s) => s.companyId)).toEqual([client])
      await expect(
        updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [
          { companyId: client, discountPct: 1 },
          { companyId: outsider, discountPct: 1 },
        ]),
      ).rejects.toThrow(FamilyShareValidationError)
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(productFamilies).where(eq(productFamilies.id, draft.id)))
    }
  })

  it('lists every supplier/client except the sharer and the owner as possible recipients', async () => {
    const { shares, targets } = await getFamilyShares(ctxOf(manufacturer), familyId)
    expect(shares).toEqual([])
    const ids = targets.map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining([supplier, client, outsider]))
    expect(ids).not.toContain(manufacturer)
    expect(ids).not.toContain(platformOnly) // platform-only companies cannot receive shares
  })

  it('shares with chosen companies at their own discounts and reads them back with names', async () => {
    const saved = await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [
      { companyId: supplier, discountPct: 20 },
      { companyId: client, discountPct: 5.5 },
    ])
    expect(saved.shares.map((s) => [s.companyName, s.discountPct])).toEqual([
      ['Share Test Client', 5.5],
      ['Share Test Supplier', 20],
    ])
    expect(await getFamilyShareDiscount(ctxOf(supplier), familyId)).toBe(20)
    expect(await getFamilyShareDiscount(ctxOf(manufacturer), familyId)).toBeNull() // the owner has no share discount
  })

  it('replaces the set: a company left out loses its share, a changed discount is updated', async () => {
    const saved = await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [
      { companyId: supplier, discountPct: 30 },
    ])
    expect(saved.shares.map((s) => [s.companyId, s.discountPct])).toEqual([[supplier, 30]])
    expect(await getFamilyShareDiscount(ctxOf(client), familyId)).toBeNull()
  })

  it('lets a company that received the family share it onward, and cuts that off when the first share is revoked', async () => {
    const viaSupplier = await updateFamilyShares(ctxOf(supplier), actorOf(supplier), familyId, [
      { companyId: outsider, discountPct: 8 },
    ])
    expect(viaSupplier.shares.map((s) => s.companyId)).toEqual([outsider])
    expect(await getFamilyShareDiscount(ctxOf(outsider), familyId)).toBe(8)

    await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [])
    await expect(getFamilyShares(ctxOf(supplier), familyId)).rejects.toThrow(FamilyShareNotFoundError)
  })

  it('refuses a company that cannot reach the family, and recipients that are not allowed', async () => {
    await expect(getFamilyShares(ctxOf(outsider), familyId)).rejects.toThrow(FamilyShareNotFoundError)
    await expect(
      updateFamilyShares(ctxOf(outsider), actorOf(outsider), familyId, [{ companyId: client, discountPct: 1 }]),
    ).rejects.toThrow(FamilyShareNotFoundError)

    const bad = (companyId: string) =>
      updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [{ companyId, discountPct: 1 }])
    await expect(bad(manufacturer)).rejects.toThrow(FamilyShareValidationError) // itself
    await expect(bad(platformOnly)).rejects.toThrow(FamilyShareValidationError) // not a supplier or client
    await expect(bad('00000000-0000-0000-0000-000000000000')).rejects.toThrow(FamilyShareValidationError)
  })
})
