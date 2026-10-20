import { sql } from 'drizzle-orm'
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
}, (table) => [
  // The audit viewer pages newest-first with a (created_at, id) keyset; each filter has an index that keeps that order.
  index('audit_log_created_idx').on(table.createdAt.desc(), table.id.desc()),
  index('audit_log_company_created_idx').on(table.effectiveCompanyId, table.createdAt.desc(), table.id.desc()),
  index('audit_log_actor_created_idx').on(table.actorUserId, table.createdAt.desc(), table.id.desc()),
  index('audit_log_type_created_idx').on(table.resourceType, table.createdAt.desc(), table.id.desc()),
  index('audit_log_resource_created_idx').on(table.resourceType, table.resourceId, table.createdAt.desc(), table.id.desc()),
  // A product family's history also includes item edits recorded under the item's id (pre-2026-10 entries).
  index('audit_log_family_item_idx')
    .on(sql`(${table.metadata}->>'productFamilyId')`)
    .where(sql`${table.resourceType} = 'product_family'`),
  // "What did this request do?" — looked up from a request id in the logs or an error message.
  index('audit_log_request_id_idx').on(table.requestId).where(sql`${table.requestId} IS NOT NULL`),
])
