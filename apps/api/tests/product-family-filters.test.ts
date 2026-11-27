import { describe, expect, it } from 'vitest'
import {
  activeProductFamilyFilterCount,
  distinctProductFamilyValues,
  EMPTY_PRODUCT_FAMILY_FILTERS,
  filterProductFamilies,
  parseProductFamilyFilters,
  productFamilyFiltersToParams,
  type FilterableProductFamily,
  type ProductFamilyFilters,
} from '@schuco/contracts'

/** The product families list filters (pure logic shared by the web page). */

const family = (overrides: Partial<FilterableProductFamily> & { id: string; name: string }): FilterableProductFamily => ({
  technicalName: null,
  category: null,
  brand: null,
  isPublished: true,
  readyForInvoicing: true,
  hasPriceList: true,
  inLibrary: true,
  supersedesId: null,
  priceValidFrom: null,
  priceValidTo: null,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  ...overrides,
})

const TODAY = '2026-06-15'
const families = [
  family({ id: 'a', name: 'Alpha Window', technicalName: 'W70', category: 'Finestre', brand: 'Schüco', priceValidFrom: '2026-01-01', priceValidTo: '2026-12-31', updatedAt: '2026-05-01T09:00:00.000Z' }),
  family({ id: 'b', name: 'beta door', category: 'Porte', brand: 'Acme', isPublished: false, readyForInvoicing: false, priceValidFrom: '2027-01-01', createdAt: '2026-03-01T00:00:00.000Z' }),
  family({ id: 'c', name: 'Gamma Tenda', hasPriceList: false, inLibrary: false, category: 'Tende', brand: 'Acme', priceValidFrom: '2025-01-01', priceValidTo: '2025-12-31', ownerCompanyName: 'Schuco Demo', shareDiscountPct: 10 }),
  family({ id: 'd', name: 'Alpha Window', category: 'Finestre', brand: 'Schüco', supersedesId: 'a', ownerCompanyName: 'Other Co', updatedAt: '2026-06-10T09:00:00.000Z' }),
]
const ids = (filters: Partial<ProductFamilyFilters>) =>
  filterProductFamilies(families, { ...EMPTY_PRODUCT_FAMILY_FILTERS, sort: 'name', ...filters }, TODAY).map((f) => f.id)

describe('filterProductFamilies', () => {
  it('searches name, technical name, category, brand and owner, case-insensitively', () => {
    expect(ids({ q: 'w70' })).toEqual(['a'])
    expect(ids({ q: 'BETA' })).toEqual(['b'])
    expect(ids({ q: 'acme' })).toEqual(['b', 'c'])
    expect(ids({ q: 'schuco demo' })).toEqual(['c'])
  })

  it('keeps only versions marked as a favorite', () => {
    const marked = families.map((item) => (item.id === 'd' ? { ...item, isFavorite: true } : item))
    expect(filterProductFamilies(marked, { ...EMPTY_PRODUCT_FAMILY_FILTERS, favorites: true }, TODAY).map((item) => item.id)).toEqual(['d'])
  })

  it('filters by category, brand and status', () => {
    expect(ids({ category: 'Finestre' })).toEqual(['a', 'd'])
    expect(ids({ brand: 'Acme', status: 'published' })).toEqual(['c'])
    expect(ids({ status: 'draft' })).toEqual(['b'])
    expect(ids({ invoicing: 'notReady' })).toEqual(['b'])
    expect(ids({ invoicing: 'ready' })).toEqual(['a', 'd', 'c'])
    expect(ids({ priceList: 'without' })).toEqual(['c'])
    expect(ids({ priceList: 'with' })).toEqual(['a', 'd', 'b'])
    expect(ids({ library: 'out' })).toEqual(['c'])
    expect(ids({ library: 'in' })).toEqual(['a', 'd', 'b'])
  })

  it('filters by price validity today, and by the day the prices must be valid on', () => {
    expect(ids({ validity: 'current' })).toEqual(['a', 'd'])
    expect(ids({ validity: 'upcoming' })).toEqual(['b'])
    expect(ids({ validity: 'expired' })).toEqual(['c'])
    expect(ids({ validity: 'notSet' })).toEqual(['d'])
    expect(ids({ validOn: '2027-02-01' })).toEqual(['d', 'b'])
  })

  it('filters by owner, discount, latest version and last-updated range', () => {
    expect(ids({ owner: 'Schuco Demo' })).toEqual(['c'])
    expect(ids({ discount: 'with' })).toEqual(['c'])
    expect(ids({ discount: 'without' })).toEqual(['a', 'd', 'b'])
    // `a` is replaced by its newer version `d`.
    expect(ids({ latestOnly: true })).toEqual(['d', 'b', 'c'])
    expect(ids({ updatedFrom: '2026-05-01', updatedTo: '2026-05-31' })).toEqual(['a'])
    // A reversed range means the same days.
    expect(ids({ updatedFrom: '2026-05-31', updatedTo: '2026-05-01' })).toEqual(['a'])
  })

  it('counts the updated day in Italian time, like price validity', () => {
    // 22:30 UTC on 30 April is already 1 May in Rome (UTC+2 in summer).
    const lateEvening = [family({ id: 'x', name: 'X', updatedAt: '2026-04-30T22:30:00.000Z' })]
    const run = (filters: Partial<ProductFamilyFilters>) =>
      filterProductFamilies(lateEvening, { ...EMPTY_PRODUCT_FAMILY_FILTERS, ...filters }, TODAY).map((f) => f.id)
    expect(run({ updatedFrom: '2026-05-01' })).toEqual(['x'])
    expect(run({ updatedTo: '2026-04-30' })).toEqual([])
  })

  it('sorts newest first by default, or by name (natural, case-insensitive), recent updates, or soonest price end', () => {
    expect(filterProductFamilies(families, EMPTY_PRODUCT_FAMILY_FILTERS, TODAY)[0].id).toBe('b')
    expect(ids({})).toEqual(['a', 'd', 'b', 'c'])
    expect(ids({ sort: 'updated' })).toEqual(['d', 'a', 'b', 'c'])
    expect(ids({ sort: 'created' })[0]).toBe('b')
    expect(ids({ sort: 'validTo' })).toEqual(['c', 'a', 'd', 'b'])
  })
})

describe('URL round trip', () => {
  it('parses known params, ignores junk, and writes back only what differs from the defaults', () => {
    const filters = parseProductFamilyFilters({
      q: '  window ',
      status: 'published',
      validity: 'bogus',
      validOn: 'not-a-date',
      latestOnly: '1',
      invoicing: 'ready',
      sort: 'updated',
      tab: 'shared',
    })
    expect(filters).toMatchObject({ q: 'window', status: 'published', validity: '', validOn: '', invoicing: 'ready', latestOnly: true, sort: 'updated' })
    expect(productFamilyFiltersToParams(filters).toString()).toBe('q=window&status=published&invoicing=ready&latestOnly=1&sort=updated')
    expect(activeProductFamilyFilterCount(filters)).toBe(4)
    expect(parseProductFamilyFilters({}).sort).toBe('created')
    // Owner/discount only exist on the shared tab.
    expect(parseProductFamilyFilters({ owner: 'Acme', discount: 'with' })).toMatchObject({ owner: '', discount: '' })
    expect(parseProductFamilyFilters({ owner: 'Acme', discount: 'with' }, 'shared')).toMatchObject({ owner: 'Acme', discount: 'with' })
  })

  it('lists distinct dropdown values, sorted', () => {
    expect(distinctProductFamilyValues(families, 'brand')).toEqual(['Acme', 'Schüco'])
    expect(distinctProductFamilyValues(families, 'ownerCompanyName')).toEqual(['Other Co', 'Schuco Demo'])
  })
})
