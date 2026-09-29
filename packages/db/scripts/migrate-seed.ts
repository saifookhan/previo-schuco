import { createDb } from '../src/client'
import { seedDatabase } from '../src/seed'
import { applyMigrationsAndRls } from './lib/apply-migrations'

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://previo:previo@localhost:5432/previo'

// No fallback default here — every documented path already sets this
// explicitly (docker-compose.yml, .env.example, and Terraform's
// random_password.app for dev/staging via Secrets Manager). A silent
// default previously let a manual `pnpm db:migrate` against a real
// environment's RDS instance set previo_app's password to a hardcoded
// literal instead of the value Terraform generated and gave the running
// ECS task — the two would diverge and the API couldn't log in.
const appDbPassword = process.env.APP_DB_PASSWORD
if (!appDbPassword) {
  throw new Error(
    'Missing APP_DB_PASSWORD — must match the previo_app credential the target environment\'s ' +
      'services use (docker-compose.yml locally; the Secrets Manager "database-app" secret for dev/staging).',
  )
}

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
