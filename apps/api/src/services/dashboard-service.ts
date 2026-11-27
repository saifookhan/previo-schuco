import { dashboardResponseSchema, type DashboardPeriod, type DashboardResponse } from '@schuco/contracts'
import { listDashboardFamilies, listDashboardQuotes, listDashboardStatusEvents } from '@schuco/db'

import { buildDashboard, collapseDashboardQuotes, type DashboardQuoteGroup } from '../dashboard/aggregate'
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
    const groups = new Map<string, DashboardQuoteGroup>()
    for (const row of quoteRows) {
      const group = groups.get(row.quoteId) ?? {
        id: row.quoteId,
        reference: row.reference,
        customerName: row.customerName,
        projectLocation: row.projectLocation,
        createdAt: row.createdAt,
        createdByUserId: row.createdByUserId,
        createdByName: row.createdByName,
        variants: [],
      }
      group.variants.push({
        version: row.version,
        alternative: row.alternative,
        isFinal: row.isFinal,
        isFavorite: row.isFavorite,
        status: row.status,
        totalPrice: row.totalPrice,
        updatedAt: row.updatedAt,
        sentAt: row.sentAt,
        document: row.document,
      })
      groups.set(row.quoteId, group)
    }
    const collapsed = collapseDashboardQuotes([...groups.values()])
    const quotes = collapsed.counted
    const visibleIds = new Set([...quotes, ...collapsed.open].map((quote) => quote.id))
    const events = statusEvents.filter((event) => visibleIds.has(event.quoteId))
    const built = buildDashboard({
      now: query.now ?? new Date(),
      period: query.period,
      includeTestQuotes: query.includeTestQuotes,
      scope: query.scope,
      actorUserId: query.actorUserId,
      salespersonId: query.salespersonId,
      quotes,
      openQuotes: collapsed.open,
      events,
      families,
    })
    return dashboardResponseSchema.parse(built)
  })
