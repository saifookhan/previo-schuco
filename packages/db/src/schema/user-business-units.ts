import { boolean, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core'

import { businessUnits } from './business-units'
import { users } from './users'

/** User membership and edit rights per business unit. */
export const userBusinessUnits = pgTable(
  'user_business_units',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    businessUnitId: uuid('business_unit_id')
      .notNull()
      .references(() => businessUnits.id, { onDelete: 'cascade' }),
    canEdit: boolean('can_edit').notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.businessUnitId] }),
    // A branch's users (the company profile, and the sales contacts it offers on a quote).
    index('user_business_units_business_unit_id_idx').on(table.businessUnitId),
  ],
)
