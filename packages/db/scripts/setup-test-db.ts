import postgres from 'postgres'

import { applyMigrationsAndRls } from './lib/apply-migrations'

/**
 * Create (or reset) the `previo_test` database and apply migrations + RLS
 * to it — the real Postgres, real RLS target for the repository/DB
 * integration tests ADR 0012 mandates. Run via `pnpm --filter @schuco/db
 * test:db:setup` before `vitest run` in packages/db (wired as a
 * `pretest` script).
 */
const SUPERUSER_URL =
  process.env.TEST_DB_SUPERUSER_URL ?? 'postgresql://previo:previo@localhost:5434/previo'
const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'previo_test'
const appDbPassword = process.env.APP_DB_PASSWORD ?? 'previo_app'

const maintenanceUrl = SUPERUSER_URL.replace(/\/[^/]+$/, '/postgres')

const run = async (): Promise<void> => {
  const admin = postgres(maintenanceUrl, { max: 1 })
  console.log(`Resetting database "${TEST_DB_NAME}"...`)
  await admin.unsafe(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`)
  await admin.unsafe(`CREATE DATABASE ${TEST_DB_NAME}`)
  await admin.end()

  const testDbUrl = SUPERUSER_URL.replace(/\/[^/]+$/, `/${TEST_DB_NAME}`)
  console.log('Applying migrations + RLS + app role grants to test DB...')
  await applyMigrationsAndRls(testDbUrl, appDbPassword)

  console.log('Test DB ready.')
  process.exit(0)
}

run().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
