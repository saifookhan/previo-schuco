import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { createDb } from '../../src/client'

const MIGRATIONS_DIR = join(import.meta.dirname, '../../migrations')

/**
 * Run Drizzle migrations + apply RLS policies/app-role grants against a
 * connection string. Shared by local dev migration (`db:migrate`) and test
 * DB setup, so both stay in sync with exactly one migration path.
 * @param connectionString - Superuser/owner connection (needed for DDL/role grants)
 * @param appDbPassword - Password to set on the `previo_app` role (see ADR 0007)
 */
export const applyMigrationsAndRls = async (
  connectionString: string,
  appDbPassword: string,
): Promise<void> => {
  const db = createDb(connectionString)

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR })

  const rlsSql = readFileSync(join(MIGRATIONS_DIR, '0001_rls.sql'), 'utf8').replaceAll(
    '__APP_DB_PASSWORD__',
    appDbPassword,
  )
  const rlsClient = postgres(connectionString, { max: 1 })
  await rlsClient.unsafe(rlsSql)
  await rlsClient.end()
}
