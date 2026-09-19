import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Db } from '../src/client'
import { companies, productFamilies, supplierClientLinks } from '../src/schema'
import { withRlsTransaction, withSystemTransaction } from '../src/queries/users'
import { getTestDb } from './helpers'

/**
 * ADR 0012 mandates RLS integration test coverage for every tenant-scoped
 * table/policy. `product_families` gets its own file (not folded into
 * rls.test.ts) because its policy shape is genuinely different from
 * every other table here: visibility isn't just "my own company's rows"
 * — a client company can also see a supplier's *published* families
 * (via `supplier_client_links`), and this table's own SELECT/UPDATE/
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
      .values({ type: 'supplier', name: 'PF RLS Test Supplier A', vatNumber: 'PFRLS-SUP-A' })
      .returning({ id: companies.id })
    const [b] = await tx
      .insert(companies)
      .values({ type: 'supplier', name: 'PF RLS Test Supplier B', vatNumber: 'PFRLS-SUP-B' })
      .returning({ id: companies.id })
    const [linked] = await tx
      .insert(companies)
      .values({ type: 'client', name: 'PF RLS Test Client Linked', vatNumber: 'PFRLS-CLI-LINKED' })
      .returning({ id: companies.id })
    const [unlinked] = await tx
      .insert(companies)
      .values({ type: 'client', name: 'PF RLS Test Client Unlinked', vatNumber: 'PFRLS-CLI-UNLINKED' })
      .returning({ id: companies.id })

    supplierA = a.id
    supplierB = b.id
    clientLinkedToA = linked.id
    clientUnlinked = unlinked.id

    await tx.insert(supplierClientLinks).values({
      supplierCompanyId: supplierA,
      clientCompanyId: clientLinkedToA,
    })
  })
})

afterAll(async () => {
  await withSystemTransaction(db, async (tx) => {
    await tx.delete(productFamilies).where(
      inArray(productFamilies.supplierCompanyId, [supplierA, supplierB]),
    )
    await tx
      .delete(supplierClientLinks)
      .where(eq(supplierClientLinks.supplierCompanyId, supplierA))
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

  it('4. a linked client CANNOT see an unpublished family', async () => {
    const familyId = await withSystemTransaction(db, async (tx) => {
      const [row] = await tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplierA, name: 'Still A Draft', isPublished: false })
        .returning({ id: productFamilies.id })
      return row.id
    })

    const rows = await withRlsTransaction(db, { companyId: clientLinkedToA, isSuperAdmin: false }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(rows).toHaveLength(0)
  })

  it('5. a linked client CAN see a published family ("allowing a user to see")', async () => {
    const familyId = await withSystemTransaction(db, async (tx) => {
      const [row] = await tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplierA, name: 'Now Published', isPublished: true })
        .returning({ id: productFamilies.id })
      return row.id
    })

    const rows = await withRlsTransaction(db, { companyId: clientLinkedToA, isSuperAdmin: false }, (tx) =>
      tx.select().from(productFamilies).where(eq(productFamilies.id, familyId)),
    )
    expect(rows).toHaveLength(1)
  })

  it('6. an UNLINKED client cannot see a published family either — publishing alone is not enough, the supplier-client link matters', async () => {
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

  it('7. a linked client cannot UPDATE a supplier\'s published family, even though it can SELECT it', async () => {
    const familyId = await withSystemTransaction(db, async (tx) => {
      const [row] = await tx
        .insert(productFamilies)
        .values({ supplierCompanyId: supplierA, name: 'Client Tries To Edit', isPublished: true })
        .returning({ id: productFamilies.id })
      return row.id
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
})
