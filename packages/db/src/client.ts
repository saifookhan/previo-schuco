import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

/**
 * Create a Drizzle database client from DATABASE_URL.
 * @param connectionString - Postgres connection URL
 */
export const createDb = (connectionString: string) => {
  const client = postgres(connectionString, { max: 10 })
  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>
