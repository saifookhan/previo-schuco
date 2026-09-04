import { withRlsTransaction, type DbLike } from '@schuco/db'

import { getDb } from './db'

/** Resolved tenant/identity context a service needs to open an RLS-scoped transaction. Deliberately a plain object, not the Hono `Context` — keeps services testable without mocking the web framework. */
export interface TenantContext {
  effectiveCompanyId: string
  isSuperAdmin: boolean
}

/**
 * Open a short, tenant-scoped RLS transaction for one logical unit of DB
 * work (ADR 0006). This is the only sanctioned way for a service to touch
 * the database — never call `getDb()` directly (ADR 0006, ADR 0007).
 *
 * Keep `fn` to DB queries only. Never call out to Cognito, an external
 * API, file I/O, or anything else non-DB from inside it.
 * @param ctx - Tenant context resolved by `requireAuth` (or, for a
 *   platform-scoped job, the equivalent explicit context — see ADR 0009)
 * @param fn - DB work to run inside the RLS-scoped transaction
 */
export const withTenantDb = <T>(
  ctx: TenantContext,
  fn: (tx: DbLike) => Promise<T>,
): Promise<T> =>
  withRlsTransaction(getDb(), { companyId: ctx.effectiveCompanyId, isSuperAdmin: ctx.isSuperAdmin }, fn)
