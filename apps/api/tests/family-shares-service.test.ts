process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`

import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  auditLog,
  characteristics,
  companies,
  companyConnections,
  createDb,
  productFamilies,
  productFamilyShareItems,
  productLines,
  roles,
  users,
  withSystemTransaction,
  type Db,
} from '@schuco/db'

import { getDb } from '../src/lib/db'
import { ProductFamilyNotFoundError } from '../src/lib/product-family-edit'
import {
  isFamilyInCompanyLibrary,
  listProductFamilies,
  setProductFamilyLibraryStatus,
} from '../src/services/product-families-service'
import {
  FamilyShareNotFoundError,
  FamilyShareValidationError,
  getFamilyShareItems,
  getFamilyShares,
  updateFamilyShares,
} from '../src/services/family-shares-service'

/** Service-layer test: sharing a product family (and onward sharing) with per-company, per-line and per-option values. */

let db: Db
let manufacturer: string
let supplier: string
let client: string
let outsider: string
let platformOnly: string
let familyId: string
let lineId: string
let plainLineId: string
let optionId: string
let v1OptionId: string
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
    // Only connected companies can share with each other (Partners page).
    const connect = (a: string, b: string) =>
      tx.insert(companyConnections).values({ requesterCompanyId: a, addresseeCompanyId: b, status: 'accepted' })
    await connect(manufacturer, supplier)
    await connect(client, manufacturer)
    await connect(supplier, outsider)
    await connect(manufacturer, platformOnly)
    const [family] = await tx
      .insert(productFamilies)
      .values({ supplierCompanyId: manufacturer, name: 'Share Test Family', isPublished: true })
      .returning({ id: productFamilies.id })
    familyId = family.id
    const [line, plainLine] = await tx
      .insert(productLines)
      .values([
        { productFamilyId: familyId, name: 'Line A', unitName: 'Pezzo', unitSymbol: 'PZ', discountPct: '10', markupPct: '130', installationHoursPerUnit: '1.5', sortOrder: 0 },
        { productFamilyId: familyId, name: 'Line B', unitName: 'Pezzo', unitSymbol: 'PZ', sortOrder: 1 },
      ])
      .returning({ id: productLines.id })
    lineId = line.id
    plainLineId = plainLine.id
    const [colour] = await tx
      .insert(characteristics)
      .values({ productFamilyId: familyId, name: 'Colore' })
      .returning({ id: characteristics.id })
    const [option, v1Option] = await tx
      .insert(characteristics)
      .values([
        { productFamilyId: familyId, parentId: colour.id, name: 'RAL 9010', discountPct: '5', markupPct: '120', installationHoursPerUnit: '0.25', sortOrder: 0 },
        { productFamilyId: familyId, parentId: colour.id, name: 'Bianco', sortOrder: 1 },
      ])
      .returning({ id: characteristics.id })
    optionId = option.id
    v1OptionId = v1Option.id
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
      await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), fam.id, [{ companyId: client, items: [] }])
      const seenByClient = async () => (await listProductFamilies(ctxOf(client))).filter((f) => f.id === fam.id)

      const visible = await seenByClient()
      expect(visible).toHaveLength(1)
      expect(visible[0].ownerCompanyName).toBe('Share Test Manufacturer')
      expect(visible[0].shareDiscountPct).toBeNull() // no lines or options, so no discount on any

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
        updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [{ companyId: client, items: [] }]),
      ).rejects.toThrow(FamilyShareValidationError)

      // publish, share, then unpublish again: removing is still allowed, adding is not
      await withSystemTransaction(db, (tx) =>
        tx.update(productFamilies).set({ isPublished: true }).where(eq(productFamilies.id, draft.id)),
      )
      await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [
        { companyId: client, items: [] },
        { companyId: supplier, items: [] },
      ])
      await withSystemTransaction(db, (tx) =>
        tx.update(productFamilies).set({ isPublished: false }).where(eq(productFamilies.id, draft.id)),
      )
      const trimmed = await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [
        { companyId: client, items: [] },
      ])
      expect(trimmed.shares.map((s) => s.companyId)).toEqual([client])
      await expect(
        updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), draft.id, [
          { companyId: client, items: [] },
          { companyId: outsider, items: [] },
        ]),
      ).rejects.toThrow(FamilyShareValidationError)
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(productFamilies).where(eq(productFamilies.id, draft.id)))
    }
  })

  it('lists only connected suppliers/clients as possible recipients', async () => {
    const { shares, targets } = await getFamilyShares(ctxOf(manufacturer), familyId)
    expect(shares).toEqual([])
    const ids = targets.map((t) => t.id)
    expect(ids).toEqual(expect.arrayContaining([supplier, client]))
    expect(ids).not.toContain(outsider) // not connected with the manufacturer
    expect(ids).not.toContain(manufacturer)
    expect(ids).not.toContain(platformOnly) // connected, but platform-only companies cannot receive shares
  })

  it("lists the family's lines and options with their own values as the default (0, ×1 and 0 where the Excel has none)", async () => {
    const { items } = await getFamilyShares(ctxOf(manufacturer), familyId)
    expect(items).toEqual([
      { kind: 'line', id: lineId, name: 'Line A', characteristicName: null, discountPct: 10, markupPct: 130, installationHours: 1.5 },
      { kind: 'line', id: plainLineId, name: 'Line B', characteristicName: null, discountPct: 0, markupPct: 100, installationHours: 0 },
      { kind: 'option', id: optionId, name: 'RAL 9010', characteristicName: 'Colore', discountPct: 5, markupPct: 120, installationHours: 0.25 },
      { kind: 'option', id: v1OptionId, name: 'Bianco', characteristicName: 'Colore', discountPct: 0, markupPct: 100, installationHours: 0 },
    ])
  })

  it('shares with chosen companies at their own values per line and option, filling in the defaults for the rest', async () => {
    const saved = await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [
      { companyId: supplier, items: [{ kind: 'line', id: lineId, discountPct: 20, markupPct: 150, installationHours: 2 }] },
      { companyId: client, items: [{ kind: 'option', id: v1OptionId, discountPct: 5.5, markupPct: 110, installationHours: 0.5 }] },
    ])
    expect(saved.shares.map((s) => s.companyName)).toEqual(['Share Test Client', 'Share Test Supplier'])
    expect(saved.shares[1].items).toEqual([
      { kind: 'line', id: lineId, discountPct: 20, markupPct: 150, installationHours: 2 },
      { kind: 'line', id: plainLineId, discountPct: 0, markupPct: 100, installationHours: 0 },
      { kind: 'option', id: optionId, discountPct: 5, markupPct: 120, installationHours: 0.25 },
      { kind: 'option', id: v1OptionId, discountPct: 0, markupPct: 100, installationHours: 0 },
    ])
    // Every line and option is stored, so the recipient's values don't move if the family's own change later.
    const stored = await withSystemTransaction(db, (tx) => tx.select().from(productFamilyShareItems))
    expect(stored.filter((row) => [lineId, plainLineId, optionId, v1OptionId].includes((row.productLineId ?? row.characteristicId)!))).toHaveLength(8)

    expect(await getFamilyShareItems(ctxOf(supplier), familyId)).toMatchObject({
      [lineId]: { discountPct: 20, markupPct: 150, installationHours: 2 },
    })
    expect((await getFamilyShareItems(ctxOf(client), familyId))?.[v1OptionId]).toEqual({ discountPct: 5.5, markupPct: 110, installationHours: 0.5 })
    expect(await getFamilyShareItems(ctxOf(manufacturer), familyId)).toBeNull() // the owner's own family
    // The families list shows the highest discount the share gives.
    expect((await listProductFamilies(ctxOf(supplier))).find((f) => f.id === familyId)?.shareDiscountPct).toBe(20)
  })

  it('refuses a line or option that is not part of the family', async () => {
    const save = (item: { kind: 'line' | 'option'; id: string }) =>
      updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [
        { companyId: supplier, items: [{ ...item, discountPct: 1, markupPct: 100, installationHours: 0 }] },
      ])
    await expect(save({ kind: 'option', id: lineId })).rejects.toThrow(FamilyShareValidationError) // a line sent as an option
    await expect(save({ kind: 'line', id: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow(FamilyShareValidationError)
  })

  it('replaces the set: a company left out loses its share, changed values are updated', async () => {
    const saved = await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [
      { companyId: supplier, items: [{ kind: 'line', id: lineId, discountPct: 30, markupPct: 100, installationHours: 0 }] },
    ])
    expect(saved.shares.map((s) => [s.companyId, s.items[0].discountPct])).toEqual([[supplier, 30]])
    expect(await getFamilyShareItems(ctxOf(client), familyId)).toBeNull()
  })

  it("starts a company added to a new version from what it got on the previous one, matched by name, where the new version's Excel is empty", async () => {
    const versionIds: string[] = []
    try {
      type LineSpec = string | { name: string; discountPct: string }
      const make = async (supersedesId: string | null, lineSpecs: LineSpec[]) =>
        withSystemTransaction(db, async (tx) => {
          const [family] = await tx
            .insert(productFamilies)
            .values({ supplierCompanyId: manufacturer, name: 'Share Test Versions', isPublished: true, supersedesId })
            .returning({ id: productFamilies.id })
          versionIds.push(family.id)
          const lines = await tx
            .insert(productLines)
            .values(
              lineSpecs.map((spec) => ({
                productFamilyId: family.id,
                unitName: 'Pezzo',
                unitSymbol: 'PZ',
                ...(typeof spec === 'string' ? { name: spec } : spec),
              })),
            )
            .returning({ id: productLines.id, name: productLines.name })
          const [colour] = await tx.insert(characteristics).values({ productFamilyId: family.id, name: 'Colore' }).returning({ id: characteristics.id })
          const [ral] = await tx
            .insert(characteristics)
            .values({ productFamilyId: family.id, parentId: colour.id, name: 'RAL 9010' })
            .returning({ id: characteristics.id })
          return { id: family.id, line: (name: string) => lines.find((l) => l.name === name)!.id, ral: ral.id }
        })
      const v1 = await make(null, ['Line A', 'Old line', 'Priced line'])
      // The new Excel gives "Priced line" a discount and leaves its markup and hours empty.
      const v2 = await make(v1.id, ['Line A', 'New line', { name: 'Priced line', discountPct: '20' }])
      await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), v1.id, [
        {
          companyId: client,
          items: [
            { kind: 'line', id: v1.line('Line A'), discountPct: 12, markupPct: 140, installationHours: 3 },
            { kind: 'line', id: v1.line('Old line'), discountPct: 50, markupPct: 100, installationHours: 0 },
            { kind: 'line', id: v1.line('Priced line'), discountPct: 35, markupPct: 150, installationHours: 2 },
            { kind: 'option', id: v1.ral, discountPct: 7, markupPct: 115, installationHours: 1 },
          ],
        },
      ])

      const { previous } = await getFamilyShares(ctxOf(manufacturer), v2.id)
      expect(previous).toHaveLength(1)
      expect(previous[0].companyId).toBe(client)
      // The removed line has nothing to carry over to; the new one starts from its default in the dialog.
      expect(previous[0].items).toHaveLength(3)
      expect(previous[0].items).toEqual(
        expect.arrayContaining([
          { kind: 'line', id: v2.line('Line A'), discountPct: 12, markupPct: 140, installationHours: 3 },
          // The Excel's discount wins; the empty markup and hours come from the old share.
          { kind: 'line', id: v2.line('Priced line'), discountPct: 20, markupPct: 150, installationHours: 2 },
          { kind: 'option', id: v2.ral, discountPct: 7, markupPct: 115, installationHours: 1 },
        ]),
      )

      // Once the company has a share of this version too, its own values are what count.
      await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), v2.id, [{ companyId: client, items: [] }])
      expect((await getFamilyShares(ctxOf(manufacturer), v2.id)).previous).toEqual([])
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(productFamilies).where(inArray(productFamilies.id, versionIds.reverse())))
    }
  })

  it("when several companies share the family with one, the owner's share applies, whoever saved last", async () => {
    await withSystemTransaction(db, (tx) =>
      tx.insert(companyConnections).values({ requesterCompanyId: supplier, addresseeCompanyId: client, status: 'accepted' }),
    )
    try {
      const line = (discountPct: number) => [{ kind: 'line' as const, id: lineId, discountPct, markupPct: 100, installationHours: 0 }]
      await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [
        { companyId: supplier, items: [] },
        { companyId: client, items: line(40) },
      ])
      await updateFamilyShares(ctxOf(supplier), actorOf(supplier), familyId, [{ companyId: client, items: line(5) }])
      expect((await getFamilyShareItems(ctxOf(client), familyId))?.[lineId].discountPct).toBe(40)
      // Saving the owner's dialog again (or the supplier's) doesn't change which one applies.
      await updateFamilyShares(ctxOf(supplier), actorOf(supplier), familyId, [{ companyId: client, items: line(6) }])
      expect((await getFamilyShareItems(ctxOf(client), familyId))?.[lineId].discountPct).toBe(40)
      expect((await listProductFamilies(ctxOf(client))).find((f) => f.id === familyId)?.shareDiscountPct).toBe(40)
    } finally {
      await updateFamilyShares(ctxOf(supplier), actorOf(supplier), familyId, [])
      await withSystemTransaction(db, (tx) =>
        tx.delete(companyConnections).where(and(eq(companyConnections.requesterCompanyId, supplier), eq(companyConnections.addresseeCompanyId, client))),
      )
    }
  })

  it('lets a company that received the family share it onward, and cuts that off when the first share is revoked', async () => {
    const viaSupplier = await updateFamilyShares(ctxOf(supplier), actorOf(supplier), familyId, [
      { companyId: outsider, items: [] },
    ])
    expect(viaSupplier.shares.map((s) => s.companyId)).toEqual([outsider])
    // An onward share starts from the family's own values, not from what the sharer got.
    expect((await getFamilyShareItems(ctxOf(outsider), familyId))?.[lineId]).toEqual({ discountPct: 10, markupPct: 130, installationHours: 1.5 })

    await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [])
    await expect(getFamilyShares(ctxOf(supplier), familyId)).rejects.toThrow(FamilyShareNotFoundError)
  })

  it('refuses a company that cannot reach the family, and recipients that are not allowed', async () => {
    await expect(getFamilyShares(ctxOf(outsider), familyId)).rejects.toThrow(FamilyShareNotFoundError)
    await expect(
      updateFamilyShares(ctxOf(outsider), actorOf(outsider), familyId, [{ companyId: client, items: [] }]),
    ).rejects.toThrow(FamilyShareNotFoundError)

    const bad = (companyId: string) =>
      updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), familyId, [{ companyId, items: [] }])
    await expect(bad(manufacturer)).rejects.toThrow(FamilyShareValidationError) // itself
    await expect(bad(platformOnly)).rejects.toThrow(FamilyShareValidationError) // not a supplier or client
    await expect(bad(outsider)).rejects.toThrow(FamilyShareValidationError) // not connected
    await expect(bad('00000000-0000-0000-0000-000000000000')).rejects.toThrow(FamilyShareValidationError)
  })
})

describe('company library ("In libreria")', () => {
  it('lets each company take a family out of its own library, without touching anyone else’s', async () => {
    const [family] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(productFamilies)
        .values({ supplierCompanyId: manufacturer, name: 'Library Test Family', isPublished: true })
        .returning({ id: productFamilies.id }),
    )
    await updateFamilyShares(ctxOf(manufacturer), actorOf(manufacturer), family.id, [{ companyId: supplier, items: [] }])
    const inLibraryOf = async (companyId: string) =>
      (await listProductFamilies(ctxOf(companyId))).find((f) => f.id === family.id)?.inLibrary

    expect(await inLibraryOf(manufacturer)).toBe(true)
    expect(await inLibraryOf(supplier)).toBe(true)

    await setProductFamilyLibraryStatus(ctxOf(supplier), actorOf(supplier), family.id, false)
    expect(await inLibraryOf(supplier)).toBe(false)
    expect(await isFamilyInCompanyLibrary(ctxOf(supplier), family.id)).toBe(false)
    expect(await inLibraryOf(manufacturer)).toBe(true)

    // Same choice again: nothing changes, nothing more is recorded.
    await setProductFamilyLibraryStatus(ctxOf(supplier), actorOf(supplier), family.id, false)
    await setProductFamilyLibraryStatus(ctxOf(supplier), actorOf(supplier), family.id, true)
    expect(await inLibraryOf(supplier)).toBe(true)

    const entries = await withSystemTransaction(db, (tx) =>
      tx.select().from(auditLog).where(eq(auditLog.resourceId, family.id)).orderBy(auditLog.createdAt),
    )
    const libraryEntries = entries.filter((entry) => entry.action.startsWith('product_family.library_'))
    expect(libraryEntries.map((entry) => [entry.action, entry.effectiveCompanyId])).toEqual([
      ['product_family.library_remove', supplier],
      ['product_family.library_add', supplier],
    ])
  })

  it('refuses a company that cannot see the family, also for a super-admin acting as that company', async () => {
    await expect(setProductFamilyLibraryStatus(ctxOf(outsider), actorOf(outsider), familyId, false)).rejects.toThrow(
      ProductFamilyNotFoundError,
    )
    const superAdminAsOutsider = { effectiveCompanyId: outsider, isSuperAdmin: true }
    await expect(setProductFamilyLibraryStatus(superAdminAsOutsider, actorOf(outsider), familyId, false)).rejects.toThrow(
      ProductFamilyNotFoundError,
    )
  })

  it('leaves families out of the library out of the list only when asked to', async () => {
    const [family] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplier, name: 'Library List Family', isPublished: true })
        .returning({ id: productFamilies.id }),
    )
    await setProductFamilyLibraryStatus(ctxOf(supplier), actorOf(supplier), family.id, false)
    const ids = async (includeOutOfLibrary: boolean) =>
      (await listProductFamilies(ctxOf(supplier), { includeOutOfLibrary })).map((f) => f.id)
    expect(await ids(true)).toContain(family.id)
    expect(await ids(false)).not.toContain(family.id)
  })
})
