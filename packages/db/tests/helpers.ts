import { createDb, type Db } from '../src/client'

/**
 * Test DB connection — connects as the restricted `previo_app` role, never
 * a superuser/owner. Testing RLS through a superuser connection would
 * trivially pass regardless of whether RLS actually works (see ADR 0007 —
 * that's exactly the bug this whole test suite exists to catch a
 * regression of).
 */
export const getTestDb = (): Db => {
  const url =
    process.env.TEST_DATABASE_URL ??
    `postgresql://previo_app:${process.env.APP_DB_PASSWORD ?? 'previo_app'}@localhost:5434/previo_test`
  return createDb(url)
}
