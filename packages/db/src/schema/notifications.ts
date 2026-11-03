import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './companies'
import { companyConnections } from './company-connections'
import { users } from './users'

/**
 * An in-app notification for one user (the bell). `type` says what happened
 * (e.g. `partner.request_received`); the web app turns it into text in the
 * reader's language. `otherCompanyName` is a copy taken when the notification
 * is created, so it still reads right after the companies are no longer connected.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The user's company — what RLS checks. */
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** The company the notification is about, if any. */
    otherCompanyId: uuid('other_company_id').references(() => companies.id, { onDelete: 'cascade' }),
    otherCompanyName: text('other_company_name'),
    /** The connection request a `partner.request_received` notification is about — Accept/Refuse show while it waits. */
    connectionId: uuid('connection_id').references(() => companyConnections.id, { onDelete: 'set null' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // A user's newest notifications, and their unread count.
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    // Deleting a connection sets this to null.
    index('notifications_connection_idx').on(table.connectionId),
  ],
)
