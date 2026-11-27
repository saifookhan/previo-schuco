import { dashboardResponseSchema, type DashboardPeriod, type DashboardResponse } from '@schuco/contracts'
import { listDashboardFamilies, listDashboardQuotes, listDashboardStatusEvents } from '@schuco/db'

import { buildDashboard, type DashboardSourceQuote } from '../dashboard/aggregate'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'

export interface DashboardQuery {
  period: DashboardPeriod
  includeTestQuotes: boolean
  scope: 'own' | 'company'
  actorUserId: string
  salespersonId: string | null
  now?: Date
}

/** Company-scoped dashboard. Sales associates are limited to quotes they created. */
export const getDashboard = (ctx: TenantContext, query: DashboardQuery): Promise<DashboardResponse> =>
  withTenantDb(ctx, async (tx) => {
    const [quoteRows, statusEvents, families] = await Promise.all([
      listDashboardQuotes(tx, ctx.effectiveCompanyId, query.scope === 'own' ? query.actorUserId : null),
      listDashboardStatusEvents(tx, ctx.effectiveCompanyId),
      listDashboardFamilies(tx, ctx.effectiveCompanyId),
    ])
    const visibleIds = new Set(quoteRows.map((row) => row.id))
    const events = statusEvents.filter((event) => visibleIds.has(event.quoteId))
    const built = buildDashboard({
      now: query.now ?? new Date(),
      period: query.period,
      includeTestQuotes: query.includeTestQuotes,
      scope: query.scope,
      actorUserId: query.actorUserId,
      salespersonId: query.salespersonId,
      quotes: quoteRows.map(
        (row): DashboardSourceQuote => ({
          id: row.id,
          reference: row.reference,
          status: row.status,
          customerName: row.customerName,
          projectLocation: row.projectLocation,
          totalPrice: row.totalPrice,
          latestVersion: row.latestVersion,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          sentAt: row.sentAt,
          createdByUserId: row.createdByUserId,
          createdByName: row.createdByName,
          document: row.document,
        }),
      ),
      events,
      families,
    })
    return dashboardResponseSchema.parse(built)
  })
