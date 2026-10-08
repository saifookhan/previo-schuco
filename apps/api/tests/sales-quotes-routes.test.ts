import { describe, expect, it } from 'vitest'

import { salesQuotes } from '../src/routes/sales-quotes'

/**
 * Route-registration-order regression test (no DB/auth needed — this is
 * purely about which handler Hono picks for an ambiguous path, not about
 * what either handler does). Hono resolves a static route vs. a param
 * route at the same position by **registration order**, not specificity:
 * registering the generic `/:id/positions/:positionId` PATCH before the
 * static `/:id/positions/reorder` PATCH makes every reorder request match
 * the generic route instead, with `positionId` literally set to the
 * string "reorder" — this exact bug shipped once already and silently
 * broke the quote builder's move-up/move-down buttons (every reorder
 * call 400'd with "Position not found in this quote"). See the ordering
 * comment in `sales-quotes.ts` right above the generic PATCH route.
 */
describe('sales-quotes route registration order', () => {
  it('registers the static PATCH /:id/positions/reorder route before the generic PATCH /:id/positions/:positionId route', () => {
    const patchRoutes = salesQuotes.routes.filter((r) => r.method === 'PATCH' && r.path.includes('/positions'))
    const reorderIndex = patchRoutes.findIndex((r) => r.path.endsWith('/reorder'))
    const genericIndex = patchRoutes.findIndex((r) => r.path.endsWith('/:positionId'))

    expect(reorderIndex).toBeGreaterThanOrEqual(0)
    expect(genericIndex).toBeGreaterThanOrEqual(0)
    expect(reorderIndex).toBeLessThan(genericIndex)
  })

  it("a PATCH to .../positions/reorder is never routed to the generic positionId handler (belt-and-suspenders guard, in case registration order ever regresses)", async () => {
    // No auth header — requireAuth/requireRoles run first and would 401
    // before any positionId logic, which is exactly what we want here:
    // this only needs to prove *routing*, not full request handling. A
    // 401 means Hono matched a real route (auth middleware ran); only a
    // 404 would mean no route matched at all.
    const res = await salesQuotes.request('/00000000-0000-0000-0000-000000000000/positions/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionIds: [] }),
    })
    expect(res.status).not.toBe(404)
  })
})
