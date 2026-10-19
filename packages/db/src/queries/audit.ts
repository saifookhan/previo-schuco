import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import type { DbLike } from '../client'
import { auditLog, companies, users } from '../schema'

export interface WriteAuditLogInput {
  actorType: 'user' | 'system'
  actorUserId?: string | null
  actorCompanyId?: string | null
  effectiveCompanyId: string
  action: string
  resourceType: string
  resourceId?: string | null
  metadata?: unknown
  requestId?: string | null
  jobId?: string | null
}

/**
 * Append one audit record. INSERT only — this table is append-only (ADR
 * 0010; also enforced by revoking UPDATE/DELETE from the app DB role in
 * migrations/0001_rls.sql). Callers must run this inside the same
 * transaction as the business mutation it records, not after it commits
 * (ADR 0010's transactional-write invariant) — pass the same `tx` the
 * mutation itself used, never a separately-opened transaction.
 * @param tx - RLS-scoped transaction handle (the same one the business write used)
 * @param input - Audit record fields
 */
export const writeAuditLog = async (tx: DbLike, input: WriteAuditLogInput): Promise<void> => {
  await tx.insert(auditLog).values({
    actorType: input.actorType,
    actorUserId: input.actorUserId ?? null,
    actorCompanyId: input.actorCompanyId ?? null,
    effectiveCompanyId: input.effectiveCompanyId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
    requestId: input.requestId ?? null,
    jobId: input.jobId ?? null,
  })
}

export interface AuditLogFilters {
  companyId?: string
  actorUserId?: string
  resourceType?: string
  resourceId?: string
  requestId?: string
  from?: Date
  to?: Date
  /** Keyset position: return entries strictly older than this one. */
  before?: { createdAt: string; id: string }
}

export interface AuditLogRow {
  id: string
  createdAt: Date
  /** Full-precision (microsecond) UTC timestamp — the pagination key; a JS Date would lose precision. */
  createdAtKey: string
  action: string
  resourceType: string
  resourceId: string | null
  metadata: unknown
  requestId: string | null
  jobId: string | null
  actorType: 'user' | 'system'
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  actorCompanyId: string | null
  actorCompanyName: string | null
  effectiveCompanyId: string
  companyName: string | null
}

const actor = alias(users, 'actor')
const actorCompany = alias(companies, 'actor_company')
const targetCompany = alias(companies, 'target_company')

/**
 * Audit entries, newest first, for the audit log viewer. Runs under the
 * caller's RLS (a company sees entries filed under it; super-admin sees all),
 * so pass `companyId` for non-super-admins too — it lets the planner use
 * `audit_log_company_created_idx` instead of filtering the policy row by row.
 * Joined names come back null where RLS hides that user/company.
 * @param tx - Tenant-scoped transaction
 * @param filters - Optional filters and keyset position
 * @param limit - Max rows (callers ask for one extra to know if there's a next page)
 */
export const listAuditLogEntries = async (tx: DbLike, filters: AuditLogFilters, limit: number): Promise<AuditLogRow[]> => {
  const conditions: SQL[] = []
  if (filters.companyId !== undefined) {
    conditions.push(eq(auditLog.effectiveCompanyId, filters.companyId))
  }
  if (filters.actorUserId !== undefined) {
    conditions.push(eq(auditLog.actorUserId, filters.actorUserId))
  }
  if (filters.resourceType !== undefined) {
    conditions.push(eq(auditLog.resourceType, filters.resourceType))
  }
  if (filters.resourceId !== undefined) {
    conditions.push(eq(auditLog.resourceId, filters.resourceId))
  }
  if (filters.requestId !== undefined) {
    conditions.push(eq(auditLog.requestId, filters.requestId))
  }
  if (filters.from !== undefined) {
    conditions.push(gte(auditLog.createdAt, filters.from))
  }
  if (filters.to !== undefined) {
    conditions.push(lt(auditLog.createdAt, filters.to))
  }
  if (filters.before !== undefined) {
    conditions.push(
      sql`(${auditLog.createdAt}, ${auditLog.id}) < (${filters.before.createdAt}::timestamptz, ${filters.before.id}::uuid)`,
    )
  }

  const rows = await tx
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      createdAtKey: sql<string>`to_char(${auditLog.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      action: auditLog.action,
      resourceType: auditLog.resourceType,
      resourceId: auditLog.resourceId,
      metadata: auditLog.metadata,
      requestId: auditLog.requestId,
      jobId: auditLog.jobId,
      actorType: auditLog.actorType,
      actorUserId: auditLog.actorUserId,
      actorName: actor.name,
      actorEmail: actor.email,
      actorCompanyId: auditLog.actorCompanyId,
      actorCompanyName: actorCompany.name,
      effectiveCompanyId: auditLog.effectiveCompanyId,
      companyName: targetCompany.name,
    })
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorUserId))
    .leftJoin(actorCompany, eq(actorCompany.id, auditLog.actorCompanyId))
    .leftJoin(targetCompany, eq(targetCompany.id, auditLog.effectiveCompanyId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit)

  return rows
}

/**
 * Whether an entry with this action already exists for the resource since `since`
 * (uses `audit_log_resource_created_idx`). Lets a caller rate-limit noisy events.
 */
export const hasRecentAuditEntry = async (
  tx: DbLike,
  resourceType: string,
  resourceId: string,
  action: string,
  since: Date,
): Promise<boolean> => {
  const rows = await tx
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.resourceType, resourceType),
        eq(auditLog.resourceId, resourceId),
        gte(auditLog.createdAt, since),
        eq(auditLog.action, action),
      ),
    )
    .limit(1)
  return rows.length > 0
}
