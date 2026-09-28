import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { authTokenPurposeEnum } from './enums'
import { users } from './users'

/**
 * A one-time link's server-side half — issued for "accept your invite
 * and set a password" or "reset your forgotten password". The raw token
 * is emailed to the user and never stored; only its SHA-256 hash lives
 * here, so a DB read (a backup, a log line, a stray SELECT *) can never
 * hand someone a usable token. No RLS: this is a system-level table
 * touched only by auth-service.ts, before there's any tenant context to
 * scope it by (like `roles`).
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    purpose: authTokenPurposeEnum('purpose').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Null until consumed — checked alongside expiresAt so a token can't be replayed. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Invalidating a user's older pending tokens (see insertAuthToken) filters by this.
    userIdIdx: index('auth_tokens_user_id_idx').on(table.userId),
  }),
)
