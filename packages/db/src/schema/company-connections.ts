import { sql } from 'drizzle-orm'
import { check, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { companyConnectionStatusEnum } from './enums'
import { users } from './users'

/**
 * A business connection between two companies ("Partners" page): one company
 * asks, the other accepts. Only connected companies can share product families
 * with each other. At most one row per pair, whichever side asked. Refusing,
 * withdrawing or removing deletes the row, so "not connected" has no row.
 */
export const companyConnections = pgTable(
  'company_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requesterCompanyId: uuid('requester_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    addresseeCompanyId: uuid('addressee_company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    status: companyConnectionStatusEnum('status').notNull().default('pending'),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    respondedByUserId: uuid('responded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (table) => [
    // One row per pair, in either direction.
    uniqueIndex('company_connections_pair_idx').on(
      sql`least(${table.requesterCompanyId}, ${table.addresseeCompanyId})`,
      sql`greatest(${table.requesterCompanyId}, ${table.addresseeCompanyId})`,
    ),
    // "My connections" looks a company up on both sides.
    index('company_connections_requester_idx').on(table.requesterCompanyId),
    index('company_connections_addressee_idx').on(table.addresseeCompanyId),
    check('company_connections_no_self', sql`${table.requesterCompanyId} <> ${table.addresseeCompanyId}`),
  ],
)
