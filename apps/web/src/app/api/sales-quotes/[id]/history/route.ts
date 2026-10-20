import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** The quote's change history (anyone who can see the quote). Paged with `?cursor=`. */
export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyGetToApi(request, `/api/sales-quotes/${encodeURIComponent(id)}/history`)
}
