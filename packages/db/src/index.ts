import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const dbPath = process.env.DATABASE_URL ?? './schuco.db'

/**
 * Creates a Drizzle client connected to the local SQLite database.
 */
export const createDb = (path = dbPath) => {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  return drizzle(sqlite, { schema })
}

export { schema }
