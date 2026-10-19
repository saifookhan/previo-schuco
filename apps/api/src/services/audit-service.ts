import type { AuditLogEntry, AuditLogListResponse, AuditLogQuery } from '@schuco/contracts'
import { listAuditLogEntries, writeAuditLog, type AuditLogRow, type DbLike } from '@schuco/db'

import { withTenantDb, type TenantContext } from '../lib/tenant-db'

export interface AuditActor {
  actorType: 'user' | 'system'
  actorUserId?: string | null
  actorCompanyId?: string | null
  requestId?: string | null
  jobId?: string | null
}

export interface AuditEvent {
  action: string
  resourceType: string
  resourceId?: string | null
  metadata?: unknown
}

/**
 * Record one audit entry. **Must be called with the same transaction
 * handle (`tx`) the business mutation it records is using** — never a
 * separately-opened transaction, and never after the mutation's
 * transaction has already committed. This is what makes the audit write
 * atomic with the business change it describes (ADR 0010's central
 * invariant): if the mutation rolls back, this insert rolls back with it.
 * @param tx - The SAME transaction handle the business mutation used
 * @param actor - Who performed the action (or the system, for a job)
 * @param effectiveCompanyId - The tenant the action was performed against
 * @param event - What happened
 */
export const recordAuditEvent = (
  tx: DbLike,
  actor: AuditActor,
  effectiveCompanyId: string,
  event: AuditEvent,
): Promise<void> =>
  writeAuditLog(tx, {
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorCompanyId: actor.actorCompanyId,
    effectiveCompanyId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    metadata: event.metadata,
    requestId: actor.requestId,
    jobId: actor.jobId,
  })

/** The `cursor` query parameter isn't one this API handed out. */
export class InvalidAuditCursorError extends Error {}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_MS = 24 * 60 * 60 * 1000

const encodeCursor = (row: AuditLogRow): string =>
  Buffer.from(JSON.stringify({ t: row.createdAtKey, i: row.id })).toString('base64url')

const decodeCursor = (cursor: string): { createdAt: string; id: string } => {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown }
    if (typeof parsed.t === 'string' && typeof parsed.i === 'string' && UUID_RE.test(parsed.i) && !Number.isNaN(Date.parse(parsed.t))) {
      return { createdAt: parsed.t, id: parsed.i }
    }
  } catch {
    // fall through
  }
  throw new InvalidAuditCursorError('Invalid cursor')
}

const toEntry = (row: AuditLogRow): AuditLogEntry => ({
  id: row.id,
  createdAt: row.createdAt.toISOString(),
  action: row.action,
  resourceType: row.resourceType,
  resourceId: row.resourceId,
  metadata: row.metadata ?? null,
  requestId: row.requestId,
  jobId: row.jobId,
  actorType: row.actorType,
  actor: row.actorUserId ? { id: row.actorUserId, name: row.actorName, email: row.actorEmail } : null,
  actorCompany: row.actorCompanyId ? { id: row.actorCompanyId, name: row.actorCompanyName } : null,
  company: { id: row.effectiveCompanyId, name: row.companyName },
})

/**
 * One page of the audit log, newest first. A super-admin looking at the
 * platform (`scope=platform`, not acting as a tenant) sees every company,
 * optionally narrowed with `companyId`. Everyone else — and a super-admin on the
 * company settings page or acting as a tenant — sees only `ctx.effectiveCompanyId`,
 * whatever `companyId` they send. RLS enforces the non-super-admin case too; this
 * also keeps the query on the per-company index.
 * A date-only `to` includes that whole day.
 * @throws {InvalidAuditCursorError} `cursor` was not produced by this endpoint
 */
export const listAuditLog = async (
  ctx: TenantContext & { isActingAsTenant?: boolean },
  query: AuditLogQuery,
): Promise<AuditLogListResponse> => {
  const platformWide = ctx.isSuperAdmin && !ctx.isActingAsTenant && query.scope === 'platform'
  const before = query.cursor !== undefined ? decodeCursor(query.cursor) : undefined
  const to =
    query.to === undefined
      ? undefined
      : DATE_ONLY_RE.test(query.to)
        ? new Date(Date.parse(query.to) + DAY_MS)
        : new Date(query.to)

  const rows = await withTenantDb(ctx, (tx) =>
    listAuditLogEntries(
      tx,
      {
        companyId: platformWide ? query.companyId : ctx.effectiveCompanyId,
        actorUserId: query.actorUserId,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        requestId: query.requestId,
        from: query.from !== undefined ? new Date(query.from) : undefined,
        to,
        before,
      },
      query.limit + 1,
    ),
  )

  const page = rows.slice(0, query.limit)
  return {
    entries: page.map(toEntry),
    nextCursor: rows.length > query.limit ? encodeCursor(page[page.length - 1]) : null,
  }
}
