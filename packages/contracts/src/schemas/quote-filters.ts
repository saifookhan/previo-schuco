import { quoteStatusSchema, type QuoteStatus } from './quote-versions'

/**
 * Filters for the quotes list. Each one is a search param, so a filtered list can be
 * bookmarked and stepped through with Back. Archived quotes stay off the list until
 * `archived=1`.
 */
export interface QuoteListFilters {
  /** Free text, matched against reference, customer and project. */
  q: string
  status: '' | QuoteStatus
  archived: boolean
}

export const EMPTY_QUOTE_LIST_FILTERS: QuoteListFilters = {
  q: '',
  status: '',
  archived: false,
}

const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? '')).trim()

/** Reads the filters from page search params; anything unknown or malformed is ignored. */
export const parseQuoteListFilters = (params: Record<string, string | string[] | undefined>): QuoteListFilters => {
  const status = one(params.status)
  return {
    q: one(params.q).slice(0, 200),
    status: quoteStatusSchema.safeParse(status).success ? (status as QuoteStatus) : '',
    archived: one(params.archived) === '1',
  }
}

/** The filters as search params, leaving out defaults so URLs stay short. */
export const quoteListFiltersToParams = (filters: QuoteListFilters): URLSearchParams => {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status) params.set('status', filters.status)
  if (filters.archived) params.set('archived', '1')
  return params
}

/** Query string for `GET /api/sales-quotes`, from the page's filters. */
export const quoteListFiltersToApiQuery = (filters: QuoteListFilters): string => {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.status) params.set('status', filters.status)
  if (filters.archived) params.set('includeArchived', '1')
  const query = params.toString()
  return query ? `?${query}` : ''
}
