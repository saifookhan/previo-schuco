/**
 * A browser loading a page, or the app's own router fetching one (RSC
 * payloads, prefetches, server actions), as opposed to an API client.
 */
export const isDocumentNavigation = (request: { headers: { get(name: string): string | null } }): boolean => {
  if (request.headers.get('sec-fetch-mode') === 'navigate') return true
  if (request.headers.get('rsc') || request.headers.get('next-action')) return true
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html')
}
