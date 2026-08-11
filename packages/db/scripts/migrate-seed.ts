import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { createDb } from '../src/client'
import { seedDatabase } from '../src/seed'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://previo:previo@localhost:5432/previo'

const run = async (): Promise<void> => {
  const db = createDb(connectionString)

  console.log('Running Drizzle migrations...')
  await migrate(db, { migrationsFolder: './migrations' })

  const rlsSql = readFileSync(join(import.meta.dirname, '../migrations/0001_rls.sql'), 'utf8')
  const rlsClient = postgres(connectionString, { max: 1 })
  console.log('Applying RLS policies...')
  await rlsClient.unsafe(rlsSql)
  await rlsClient.end()

  console.log('Seeding database...')
  await seedDatabase(db)

  console.log('Done.')
  process.exit(0)
}

run().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
