/** A browser loading a page, as opposed to an API client. */
export const isDocumentNavigation = (request: { headers: { get(name: string): string | null } }): boolean => {
  if (request.headers.get('sec-fetch-mode') === 'navigate') return true
  const accept = request.headers.get('accept') ?? ''
  return accept.includes('text/html')
}
