import { bootstrapApiEnv } from '@schuco/env'

// Same order as src/index.ts: resolve env before anything that reads it loads.
bootstrapApiEnv()
const { withSystemTransaction } = await import('@schuco/db')
const { getDb } = await import('../src/lib/db')
const { backfillFamilyChanges } = await import('../src/services/product-families-service')

/**
 * Stores what changed in every product family version and copy that has no stored change list
 * yet (families from before change lists were stored, or after the diff code changed). Safe to
 * re-run — does nothing once every list is current.
 *
 * Local: `pnpm --filter @schuco/api backfill:family-changes`
 * Server: `docker compose --profile selfhost run --rm api pnpm backfill:family-changes`
 */
const main = async () => {
  const count = await withSystemTransaction(getDb(), (tx) => backfillFamilyChanges(tx))
  console.log(`Stored ${count} change list(s)`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
