import { createDb, type Db } from '@schuco/db'

let db: Db | null = null

/**
 * Singleton Postgres client for the API process.
 */
export const getDb = (): Db => {
  if (!db) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_URL is not set')
    }
    db = createDb(url)
  }
  return db
}
