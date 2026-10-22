import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Proxies "Duplicate" with the fields confirmed in the copy dialog. */
export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyJson(request, `/api/product-families/${encodeURIComponent(id)}/duplicate`, 'POST')
}
