import type { DbLike } from '../client'
import { auditLog } from '../schema'

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
