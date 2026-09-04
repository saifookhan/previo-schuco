import { createDb } from '../src/client'
import { seedDatabase } from '../src/seed'
import { applyMigrationsAndRls } from './lib/apply-migrations'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://previo:previo@localhost:5432/previo'
const appDbPassword = process.env.APP_DB_PASSWORD ?? 'previo_app'

const run = async (): Promise<void> => {
  console.log('Running Drizzle migrations + applying RLS policies + app role grants...')
  await applyMigrationsAndRls(connectionString, appDbPassword)

  console.log('Seeding database...')
  await seedDatabase(createDb(connectionString))

  console.log('Done.')
  process.exit(0)
}

run().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
