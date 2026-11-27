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

  // `invoiced` is added in 0031. Postgres refuses to use a new enum value until that
  // transaction commits, and Drizzle runs every migration in one transaction, so the
  // existing sent/rejected rows are moved here, after migrate returns.
  const rlsSql = readFileSync(join(MIGRATIONS_DIR, '0001_rls.sql'), 'utf8')
  const rlsClient = postgres(connectionString, { max: 1 })
  await rlsClient.unsafe(`
    UPDATE "quotes" SET "status" = 'invoiced' WHERE "status" = 'sent';
    UPDATE "quote_versions" SET "status" = 'invoiced' WHERE "status" = 'sent';
    UPDATE "quotes" SET "status" = 'draft' WHERE "status" = 'rejected';
    UPDATE "quote_versions" SET "status" = 'draft' WHERE "status" = 'rejected';
  `)
  await rlsClient.unsafe(rlsSql)
  // ALTER ROLE is a utility statement — Postgres doesn't accept a bind
  // parameter ($1) in place of the password literal there (`syntax error
  // at or near "$1"` if you try). Instead: pass appDbPassword as a real
  // bound parameter to a plain SELECT (safe — parameters work fine for
  // expressions), and have Postgres's own quote_literal() produce a
  // correctly-escaped SQL string literal server-side; that escaped text
  // is then safe to splice into the ALTER ROLE statement regardless of
  // what characters (quotes included) the password contains.
  const [{ quoted }] = await rlsClient<
    [{ quoted: string }]
  >`SELECT quote_literal(${appDbPassword}) AS quoted`
  // Runs unconditionally (fresh role or pre-existing), so the role's
  // password always ends up matching this value, never the migration
  // file's throwaway placeholder.
  await rlsClient.unsafe(`ALTER ROLE previo_app WITH PASSWORD ${quoted}`)
  await rlsClient.end()
}
