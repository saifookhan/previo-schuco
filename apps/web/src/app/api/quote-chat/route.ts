import { authConfig } from '@/lib/auth/config'
import { buildAuthHeaders } from '@/lib/api/server-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Proxies the quote assistant stream without buffering the body. */
export const POST = async (request: Request): Promise<Response> => {
  const headers = await buildAuthHeaders()
  if (!headers) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await request.text()
  const response = await fetch(`${authConfig.apiUrl}/api/quote-chat`, {
    method: 'POST',
    headers,
    body,
    cache: 'no-store',
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
