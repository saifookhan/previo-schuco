import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Db } from '../src/client'
import { companies, productFamilies, productFamilyChanges, productFamilyShares } from '../src/schema'
import { withRlsTransaction, withSystemTransaction } from '../src/queries/users'
import { getTestDb } from './helpers'

/**
 * ADR 0012 mandates RLS integration test coverage for every tenant-scoped
 * table/policy. `product_families` gets its own file (not folded into
 * rls.test.ts) because its policy shape is genuinely different from
 * every other table here: visibility isn't just "my own company's rows"
 * — a client company can also see a supplier's *published* families
 * (via `product_family_shares`), and this table's own SELECT/UPDATE/
 * DELETE policies must use a direct `supplier_company_id` column check,
 * NOT the `app_owns_product_family`/`app_can_view_product_family` helper
 * functions those same policies delegate to on every CHILD table
 * (product_lines, characteristics, etc.) — using the helper here is
 * self-referential (the helper SELECTs from product_families to check
 * the very row product_families' own policy is being evaluated for) and
 * reliably fails `INSERT ... RETURNING` with "new row violates row-level
 * security policy," which is exactly the bug this file's first test
 * would have caught before it shipped.
 */

let db: Db
let supplierA: string
let supplierB: string
let clientLinkedToA: string
let clientUnlinked: string

beforeAll(async () => {
  db = getTestDb()

  await withSystemTransaction(db, async (tx) => {
    const [a] = await tx
      .insert(companies)
      .values({ isManufacturer: true, isSupplier: true, name: 'PF RLS Test Supplier A', vatNumber: 'PFRLS-SUP-A' })
      .returning({ id: companies.id })
    const [b] = await tx
      .insert(companies)
      .values({ isManufacturer: true, isSupplier: true, name: 'PF RLS Test Supplier B', vatNumber: 'PFRLS-SUP-B' })
      .returning({ id: companies.id })
    const [linked] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'PF RLS Test Client Linked', vatNumber: 'PFRLS-CLI-LINKED' })
      .returning({ id: companies.id })
    const [unlinked] = await tx
      .insert(companies)
      .values({ isClient: true, name: 'PF RLS Test Client Unlinked', vatNumber: 'PFRLS-CLI-UNLINKED' })
      .returning({ id: companies.id })

    supplierA = a.id
    supplierB = b.id
    clientLinkedToA = linked.id
    clientUnlinked = unlinked.id
  })
})

/** Creates a family owned by `owner` and shares it `from` → `to` in one go (the share is what makes it visible to `to`). */
const createSharedFamily = (
  name: string,
  opts: { published: boolean; owner: string; from: string; to: string },
): Promise<string> =>
  withSystemTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(productFamilies)
      .values({ supplierCompanyId: opts.owner, name, isPublished: opts.published })
      .returning({ id: productFamilies.id })
    await tx.insert(productFamilyShares).values({
      productFamilyId: row.id,
      fromCompanyId: opts.from,
      toCompanyId: opts.to,
    })
    return row.id
  })

afterAll(async () => {
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(productFamilies).where(
      inArray(productFamilies.supplierCompanyId, [supplierA, supplierB]),
    )
    await tx
      .delete(companies)
      .where(inArray(companies.id, [supplierA, supplierB, clientLinkedToA, clientUnlinked]))
  })
})

describe('product_families RLS', () => {
  it('1. a supplier can INSERT its own product family and get it back via RETURNING (regression test for the self-referential-policy bug)', async () => {
    const rows = await withRlsTransaction(db, { companyId: supplierA, isSuperAdmin: false }, (tx) =>
      tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplierA, name: 'Unpublished Draft' })
        .returning({ id: productFamilies.id, name: productFamilies.name }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Unpublished Draft')
  })

  it('1b. a company that is a supplier but not a manufacturer cannot INSERT a product family', async () => {
    const [sellerOnly] = await withSystemTransaction(db, (tx) =>
      tx
        .insert(companies)
        .values({ isSupplier: true, name: 'PF RLS Test Seller Only', vatNumber: 'PFRLS-SELLER-ONLY' })
        .returning({ id: companies.id }),
    )
    try {
      await expect(
        withRlsTransaction(db, { companyId: sellerOnly.id, isSuperAdmin: false }, (tx) =>
          tx.insert(productFamilies).values({ supplierCompanyId: sellerOnly.id, name: 'Not Allowed' }),
        ),
      ).rejects.toThrow()
    } finally {
      await withSystemTransaction(db, (tx) => tx.delete(companies).where(eq(companies.id, sellerOnly.id)))
    }
  })

  it('2. a supplier can access its own family, published or not', async () => {
    const familyId = await withSystemTransaction(db, async (tx) => {
      const [row] = await tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplierA, name: 'Own Unpublished' })
        .returning({ id: productFamilies.id })
      return row.id
    })

    const rows = await withRlsTransaction(db, { companyId: supplierA, isSuperAdmin: false }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(rows).toHaveLength(1)
  })

  it('3. a different supplier cannot see another supplier\'s family at all', async () => {
    const familyId = await withSystemTransaction(db, async (tx) => {
      const [row] = await tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplierA, name: 'Supplier A Only' })
        .returning({ id: productFamilies.id })
      return row.id
    })

    const rows = await withRlsTransaction(db, { companyId: supplierB, isSuperAdmin: false }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(rows).toHaveLength(0)
  })

  it('4. a company a family was shared with CANNOT see it while it is unpublished', async () => {
    const familyId = await createSharedFamily('Still A Draft', {
      published: false,
      owner: supplierA,
      from: supplierA,
      to: clientLinkedToA,
    })

    const rows = await withRlsTransaction(db, { companyId: clientLinkedToA, isSuperAdmin: false }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(rows).toHaveLength(0)
  })

  it('5. a company a family was shared with CAN see it once it is published', async () => {
    const familyId = await createSharedFamily('Now Published', {
      published: true,
      owner: supplierA,
      from: supplierA,
      to: clientLinkedToA,
    })

    const rows = await withRlsTransaction(db, { companyId: clientLinkedToA, isSuperAdmin: false }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(rows).toHaveLength(1)
  })

  it('6. a company the family was NOT shared with cannot see it even when published — publishing alone is not enough', async () => {
    const familyId = await withSystemTransaction(db, async (tx) => {
      const [row] = await tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplierA, name: 'Published But Unlinked', isPublished: true })
        .returning({ id: productFamilies.id })
      return row.id
    })

    const rows = await withRlsTransaction(db, { companyId: clientUnlinked, isSuperAdmin: false }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(rows).toHaveLength(0)
  })

  it('7. a company a family was shared with cannot UPDATE it, even though it can SELECT it', async () => {
    const familyId = await createSharedFamily('Client Tries To Edit', {
      published: true,
      owner: supplierA,
      from: supplierA,
      to: clientLinkedToA,
    })

    const updated = await withRlsTransaction(db, { companyId: clientLinkedToA, isSuperAdmin: false }, (tx) =>
      tx
        .update(productFamilies)
        .set({ name: 'Hacked' })
        .where(eq(productFamilies.id, familyId))
        .returning({ id: productFamilies.id }),
    )
    expect(updated).toHaveLength(0)

    const [unchanged] = await withSystemTransaction(db, (tx) =>
      tx.select({ name: productFamilies.name }).from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(unchanged.name).toBe('Client Tries To Edit')
  })

  it('7b. onward sharing: A → linked client → unlinked client makes it visible downstream, and revoking the first hop cuts the second off', async () => {
    const familyId = await createSharedFamily('Shared Onward', {
      published: true,
      owner: supplierA,
      from: supplierA,
      to: clientLinkedToA,
    })
    await withSystemTransaction(db, (tx) =>
      tx.insert(productFamilyShares).values({
        productFamilyId: familyId,
        fromCompanyId: clientLinkedToA,
        toCompanyId: clientUnlinked,
        discountPct: '12.50',
      }),
    )
    const visibleTo = (companyId: string) =>
      withRlsTransaction(db, { companyId, isSuperAdmin: false }, (tx) =>
        tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
      )
    expect(await visibleTo(clientUnlinked)).toHaveLength(1)

    await withSystemTransaction(db, (tx) =>
      tx
        .delete(productFamilyShares)
        .where(and(eq(productFamilyShares.productFamilyId, familyId), eq(productFamilyShares.fromCompanyId, supplierA))),
    )
    expect(await visibleTo(clientLinkedToA)).toHaveLength(0)
    expect(await visibleTo(clientUnlinked)).toHaveLength(0) // the downstream edge still exists but is no longer reachable
  })

  it('8. super-admin sees every family regardless of company or published status', async () => {
    const rows = await withRlsTransaction(db, { companyId: supplierB, isSuperAdmin: true }, (tx) =>
      tx.select().from(productFamilies).where(inArray(productFamilies.supplierCompanyId, [supplierA, supplierB])),
    )
    expect(rows.length).toBeGreaterThanOrEqual(6)
  })

  it('9. acting-as-tenant with an explicit filter narrows a super-admin to just that supplier\'s families', async () => {
    const rows = await withRlsTransaction(db, { companyId: supplierB, isSuperAdmin: true }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.supplierCompanyId, supplierB)),
    )
    expect(rows.every((r) => r.supplierCompanyId === supplierB)).toBe(true)
  })

  it('10. stored change lists: the owner writes them; a company both families are shared with reads them but cannot write; others see nothing', async () => {
    const shared = { published: true, owner: supplierA, from: supplierA, to: clientLinkedToA }
    const olderId = await createSharedFamily('Changes Older', shared)
    const newerId = await createSharedFamily('Changes Newer', shared)
    const row = { productFamilyId: newerId, fromFamilyId: olderId, diffVersion: 1 }
    const as = (companyId: string) => ({ companyId, isSuperAdmin: false })

    await withRlsTransaction(db, as(supplierA), (tx) => tx.insert(productFamilyChanges).values({ ...row, changes: [] }))
    const read = (companyId: string) =>
      withRlsTransaction(db, as(companyId), (tx) => tx.select().from(productFamilyChanges).where(eq(productFamilyChanges.productFamilyId, newerId)))
    expect(await read(clientLinkedToA)).toHaveLength(1)
    expect(await read(supplierB)).toHaveLength(0)

    await expect(
      withRlsTransaction(db, as(clientLinkedToA), (tx) => tx.insert(productFamilyChanges).values({ ...row, fromFamilyId: newerId, productFamilyId: olderId, changes: [] })),
    ).rejects.toThrow()
    const updated = await withRlsTransaction(db, as(clientLinkedToA), (tx) =>
      tx.update(productFamilyChanges).set({ changes: ['forged'] }).where(eq(productFamilyChanges.productFamilyId, newerId)).returning(),
    )
    expect(updated).toHaveLength(0)
  })
})
