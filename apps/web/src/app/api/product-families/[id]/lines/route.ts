import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Proxies adding a product line. */
export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyJson(request, `/api/product-families/${encodeURIComponent(id)}/lines`, 'POST')
}
