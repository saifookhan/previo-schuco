import { bootstrapApiEnv } from '@schuco/env'

import { buildSampleWorkbook, SAMPLE_FAMILY_NAME } from './sample-workbook'

// Same order as src/index.ts: resolve env before anything that reads it loads.
bootstrapApiEnv()
const { companies, productFamilies, users, withSystemTransaction } = await import('@schuco/db')
const { and, eq } = await import('drizzle-orm')
const { getDb } = await import('../src/lib/db')
const { updateFamilyShares } = await import('../src/services/family-shares-service')
const { deleteProductFamily, importProductFamilyFromExcel, setProductFamilyPublishedStatus } = await import(
  '../src/services/product-families-service'
)

/**
 * Gives a fresh demo database something to quote from: imports the sample
 * workbook as Suppli (the seeded manufacturer + supplier), publishes it and
 * shares it with Technometal at 10%. Goes through the real services, so it
 * is audited like a manual import. Safe to re-run — skips when Suppli
 * already has a family with the sample's name.
 *
 * Local: `pnpm --filter @schuco/api seed:demo-family`
 * Server: `docker compose --profile selfhost run --rm api pnpm seed:demo-family`
 */
const SUPPLIER_ADMIN_EMAIL = 'admin@suppli-demo.it'
const SHARE_WITH_VAT = 'IT98765432109' // Technometal S.p.A.
const SHARE_DISCOUNT_PCT = 10

const main = async () => {
  const db = getDb()

  const { supplier, technometal, existing } = await withSystemTransaction(db, async (tx) => {
    const [supplierRow] = await tx
      .select({ userId: users.id, companyId: users.companyId })
      .from(users)
      .where(eq(users.email, SUPPLIER_ADMIN_EMAIL))
    if (!supplierRow) {
      throw new Error(`Seed user ${SUPPLIER_ADMIN_EMAIL} not found — run the database seed first`)
    }
    const [technometalRow] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.vatNumber, SHARE_WITH_VAT))
    const [existingRow] = await tx
      .select({ id: productFamilies.id })
      .from(productFamilies)
      .where(and(eq(productFamilies.supplierCompanyId, supplierRow.companyId), eq(productFamilies.name, SAMPLE_FAMILY_NAME)))
    return { supplier: supplierRow, technometal: technometalRow, existing: existingRow }
  })

  if (existing) {
    console.log(`"${SAMPLE_FAMILY_NAME}" already exists for Suppli — nothing to do`)
    return
  }

  const ctx = { effectiveCompanyId: supplier.companyId, isSuperAdmin: false }
  const actor = { actorUserId: supplier.userId, actorCompanyId: supplier.companyId, requestId: 'seed-demo-family' }

  const family = await importProductFamilyFromExcel(ctx, actor, supplier.companyId, {
    buffer: buildSampleWorkbook(),
    originalName: 'previo-sample-family.xlsx',
  })
  // Import, publish and share are separate transactions. The "already exists" check above only
  // looks at the name, so a half-finished family would be skipped forever — remove it instead,
  // and the next run starts over.
  try {
    await setProductFamilyPublishedStatus(ctx, actor, family.id, true)
    if (technometal) {
      await updateFamilyShares(ctx, actor, family.id, [{ companyId: technometal.id, discountPct: SHARE_DISCOUNT_PCT }])
    }
  } catch (error) {
    await deleteProductFamily(ctx, actor, family.id)
    throw error
  }

  console.log(`Imported and published "${SAMPLE_FAMILY_NAME}" for Suppli${technometal ? `, shared with Technometal at ${SHARE_DISCOUNT_PCT}%` : ''}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
