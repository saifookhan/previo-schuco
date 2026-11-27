import { priceValidityStatus, priceValidityToday } from './product-family-import'

/**
 * Filters and sort for the product families list. Each one is a search param, so a filtered
 * list can be bookmarked, shared, and stepped through with the browser's Back button. The list endpoint already
 * returns every family the caller can see, so filtering runs on that list, not in SQL.
 */
/** `created` (newest first) is the default — the order the list had before it could be sorted. */
export const PRODUCT_FAMILY_SORTS = ['created', 'updated', 'name', 'validTo'] as const
export type ProductFamilySort = (typeof PRODUCT_FAMILY_SORTS)[number]

export const PRODUCT_FAMILY_VALIDITY_FILTERS = ['current', 'upcoming', 'expired', 'notSet'] as const
export type ProductFamilyValidityFilter = (typeof PRODUCT_FAMILY_VALIDITY_FILTERS)[number]

export interface ProductFamilyFilters {
  /** Free text, matched (case-insensitive) against name, technical name, category, brand and owner. */
  q: string
  category: string
  brand: string
  status: '' | 'published' | 'draft'
  validity: '' | ProductFamilyValidityFilter
  /** `YYYY-MM-DD`: only families whose prices can be used on that day. */
  validOn: string
  /** Whether the family is offered for new quote positions. */
  invoicing: '' | 'ready' | 'notReady'
  /** "Con listino": whether there are prices behind the family. */
  priceList: '' | 'with' | 'without'
  /** "In libreria": whether the family is in the company's library. */
  library: '' | 'in' | 'out'
  /** Shared tab: the owning company's name. */
  owner: string
  /** Shared tab: whether the family was shared with a discount. */
  discount: '' | 'with' | 'without'
  /** Hide versions a newer version in the list replaces. */
  latestOnly: boolean
  /** Include families a company admin has archived. Off by default. */
  archived: boolean
  /** `YYYY-MM-DD`, inclusive, on the last-updated day in Italian time (like price validity). */
  updatedFrom: string
  updatedTo: string
  sort: ProductFamilySort
}

export const EMPTY_PRODUCT_FAMILY_FILTERS: ProductFamilyFilters = {
  q: '',
  category: '',
  brand: '',
  status: '',
  validity: '',
  validOn: '',
  invoicing: '',
  priceList: '',
  library: '',
  owner: '',
  discount: '',
  latestOnly: false,
  archived: false,
  updatedFrom: '',
  updatedTo: '',
  sort: 'created',
}

/** The fields filtering and sorting read — a subset of the list endpoint's family rows. */
export interface FilterableProductFamily {
  id: string
  name: string
  technicalName: string | null
  category: string | null
  brand: string | null
  isPublished: boolean
  readyForInvoicing: boolean
  hasPriceList: boolean
  /** In the company's library; the list endpoint always sends it. */
  inLibrary?: boolean
  supersedesId: string | null
  priceValidFrom: string | null
  priceValidTo: string | null
  createdAt: string
  updatedAt: string
  ownerCompanyName?: string | null
  shareDiscountPct?: number | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? '')).trim()
const oneOf = <T extends string>(value: string, allowed: readonly T[]): T | '' => ((allowed as readonly string[]).includes(value) ? (value as T) : '')
const day = (value: string) => (DAY.test(value) ? value : '')

/**
 * Reads the filters from page search params; anything unknown or malformed is ignored, and so are
 * owner/discount outside the shared tab (they would hide every family of your own).
 */
export const parseProductFamilyFilters = (
  params: Record<string, string | string[] | undefined>,
  tab: 'own' | 'shared' = 'own',
): ProductFamilyFilters => ({
  q: one(params.q).slice(0, 200),
  category: one(params.category),
  brand: one(params.brand),
  status: oneOf(one(params.status), ['published', 'draft'] as const),
  validity: oneOf(one(params.validity), PRODUCT_FAMILY_VALIDITY_FILTERS),
  validOn: day(one(params.validOn)),
  invoicing: oneOf(one(params.invoicing), ['ready', 'notReady'] as const),
  priceList: oneOf(one(params.priceList), ['with', 'without'] as const),
  library: oneOf(one(params.library), ['in', 'out'] as const),
  owner: tab === 'shared' ? one(params.owner) : '',
  discount: tab === 'shared' ? oneOf(one(params.discount), ['with', 'without'] as const) : '',
  latestOnly: one(params.latestOnly) === '1',
  archived: one(params.archived) === '1',
  updatedFrom: day(one(params.updatedFrom)),
  updatedTo: day(one(params.updatedTo)),
  sort: oneOf(one(params.sort), PRODUCT_FAMILY_SORTS) || EMPTY_PRODUCT_FAMILY_FILTERS.sort,
})

/** The filters as search params, leaving out defaults so URLs stay short. */
export const productFamilyFiltersToParams = (filters: ProductFamilyFilters): URLSearchParams => {
  const params = new URLSearchParams()
  for (const key of Object.keys(EMPTY_PRODUCT_FAMILY_FILTERS) as Array<keyof ProductFamilyFilters>) {
    const value = filters[key]
    if (value === EMPTY_PRODUCT_FAMILY_FILTERS[key]) continue
    params.set(key, typeof value === 'boolean' ? '1' : value)
  }
  return params
}

/** How many filters differ from the defaults (sort doesn't count — it never hides anything). */
export const activeProductFamilyFilterCount = (filters: ProductFamilyFilters): number =>
  (Object.keys(EMPTY_PRODUCT_FAMILY_FILTERS) as Array<keyof ProductFamilyFilters>).filter(
    (key) => key !== 'sort' && filters[key] !== EMPTY_PRODUCT_FAMILY_FILTERS[key],
  ).length

/**
 * "Valid today" matches what the quote builder offers, so families without dates (always usable)
 * count as current; "No dates" picks out just those.
 */
const matchesValidity = (family: FilterableProductFamily, filter: ProductFamilyValidityFilter, today: string): boolean =>
  filter === 'notSet' ? !family.priceValidFrom && !family.priceValidTo : priceValidityStatus(family, today) === filter

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

/**
 * Applies the filters and sort. `today` decides current/upcoming/expired — pass the server's
 * `priceValidityToday()` so the result matches the badges on the page.
 */
export const filterProductFamilies = <T extends FilterableProductFamily>(
  families: readonly T[],
  filters: ProductFamilyFilters,
  today: string = priceValidityToday(),
): T[] => {
  const q = filters.q.toLowerCase()
  // A version is replaced when a newer one in the same list names it as `supersedesId`.
  const replaced = new Set(families.map((f) => f.supersedesId).filter((id): id is string => id !== null))

  // A reversed range means the same days.
  const [updatedFrom, updatedTo] =
    filters.updatedFrom && filters.updatedTo && filters.updatedFrom > filters.updatedTo
      ? [filters.updatedTo, filters.updatedFrom]
      : [filters.updatedFrom, filters.updatedTo]

  const kept = families.filter((family) => {
    if (
      q &&
      ![family.name, family.technicalName, family.category, family.brand, family.ownerCompanyName].some((text) =>
        text?.toLowerCase().includes(q),
      )
    ) {
      return false
    }
    if (filters.category && family.category !== filters.category) return false
    if (filters.brand && family.brand !== filters.brand) return false
    if (filters.status && family.isPublished !== (filters.status === 'published')) return false
    if (filters.validity && !matchesValidity(family, filters.validity, today)) return false
    if (filters.invoicing && family.readyForInvoicing !== (filters.invoicing === 'ready')) return false
    if (filters.priceList && family.hasPriceList !== (filters.priceList === 'with')) return false
    if (filters.library && (family.inLibrary ?? true) !== (filters.library === 'in')) return false
    if (filters.validOn && priceValidityStatus(family, filters.validOn) !== 'current') return false
    if (filters.owner && family.ownerCompanyName !== filters.owner) return false
    if (filters.discount && Boolean(family.shareDiscountPct) !== (filters.discount === 'with')) return false
    if (filters.latestOnly && replaced.has(family.id)) return false
    if (updatedFrom || updatedTo) {
      const updatedDay = priceValidityToday(new Date(family.updatedAt))
      if (updatedFrom && updatedDay < updatedFrom) return false
      if (updatedTo && updatedDay > updatedTo) return false
    }
    return true
  })

  const byName = (a: T, b: T) => compareText(a.name, b.name)
  const sorters: Record<ProductFamilySort, (a: T, b: T) => number> = {
    name: byName,
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt) || byName(a, b),
    created: (a, b) => b.createdAt.localeCompare(a.createdAt) || byName(a, b),
    // Soonest end first; open-ended ("until further notice") last.
    validTo: (a, b) => (a.priceValidTo ?? '9999-12-31').localeCompare(b.priceValidTo ?? '9999-12-31') || byName(a, b),
  }
  return [...kept].sort(sorters[filters.sort])
}

/** Distinct non-empty values of one text field, sorted — the options of a filter dropdown. */
export const distinctProductFamilyValues = (
  families: readonly FilterableProductFamily[],
  field: 'category' | 'brand' | 'ownerCompanyName',
): string[] =>
  [...new Set(families.map((family) => family[field]).filter((value): value is string => Boolean(value)))].sort(compareText)
