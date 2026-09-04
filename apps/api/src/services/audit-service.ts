import { writeAuditLog, type DbLike } from '@schuco/db'

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
