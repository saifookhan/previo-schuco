import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { users } from './users'

/** Who performed an audited action — a real user, or a system/background process (ADR 0010). */
export const auditActorTypeEnum = pgEnum('audit_actor_type', ['user', 'system'])

/**
 * Append-only audit trail (ADR 0010). The application never issues UPDATE
 * or DELETE against this table — only INSERT (enforced additionally by
 * revoking those grants from the app DB role, see migrations/0001_rls.sql).
 * Every audit write must happen inside the same DB transaction as the
 * business mutation it records — that invariant lives in application code
 * (services), not in this schema.
 */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorType: auditActorTypeEnum('actor_type').notNull(),
  // Nullable: a system/job actor has no user id — never fabricate one to satisfy a NOT NULL constraint.
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  // Nullable alongside actorUserId for system actions with no company.
  actorCompanyId: uuid('actor_company_id').references(() => companies.id, { onDelete: 'set null' }),
  effectiveCompanyId: uuid('effective_company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata'),
  requestId: text('request_id'),
  jobId: text('job_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
