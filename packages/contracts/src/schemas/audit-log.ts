import { z } from 'zod'

/** GET /api/audit-log query string. Every filter is optional; results are newest first. */
export const auditLogQuerySchema = z.object({
  /**
   * `company` (the settings page): only the caller's current company, even for a super-admin.
   * `platform` (default, the admin panel): a super-admin sees every company; anyone else still only their own.
   */
  scope: z.enum(['company', 'platform']).default('platform'),
  /** Super-admin with `scope=platform` only — ignored otherwise. */
  companyId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  resourceType: z.string().min(1).max(64).optional(),
  resourceId: z.string().min(1).max(128).optional(),
  requestId: z.string().min(1).max(64).optional(),
  /** Inclusive lower bound and exclusive upper bound, ISO date or datetime; a date-only `to` includes that whole day. */
  from: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  /** Opaque value from the previous page's `nextCursor`. */
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>

const auditPartySchema = z.object({ id: z.string().uuid(), name: z.string().nullable() })

/** One audit entry as shown in the audit log viewer. Joined names are null when RLS hides the row (e.g. a platform admin seen from a company). */
export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  metadata: z.unknown().nullable(),
  requestId: z.string().nullable(),
  jobId: z.string().nullable(),
  actorType: z.enum(['user', 'system']),
  actor: auditPartySchema.extend({ email: z.string().nullable() }).nullable(),
  actorCompany: auditPartySchema.nullable(),
  company: auditPartySchema,
})

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>

/** GET /api/audit-log response. `nextCursor` is null on the last page. */
export const auditLogListResponseSchema = z.object({
  entries: z.array(auditLogEntrySchema),
  nextCursor: z.string().nullable(),
})

export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>
