import { and, eq, inArray } from 'drizzle-orm'

import type { DbLike } from '../client'
import { businessUnits } from '../schema'

/**
 * Return only the ids, from `ids`, that actually belong to `companyId` —
 * used to validate an invite's `businessUnitIds` before assignment, so a
 * company-admin can't assign a business unit belonging to another
 * company just because RLS's `user_bu_tenant` policy only checks the
 * invited user's own company, not the business unit's.
 * @param db - RLS-scoped transaction
 * @param companyId - Company the business units must belong to
 * @param ids - Candidate business unit ids to validate
 */
export const filterBusinessUnitIdsByCompany = async (
  db: DbLike,
  companyId: string,
  ids: string[],
): Promise<string[]> => {
  if (ids.length === 0) {
    return []
  }
  const rows = await db
    .select({ id: businessUnits.id })
    .from(businessUnits)
    .where(and(eq(businessUnits.companyId, companyId), inArray(businessUnits.id, ids)))

  return rows.map((row) => row.id)
}
