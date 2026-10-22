import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Proxies a change of the family's price validity dates. */
export const PUT = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyJson(request, `/api/product-families/${encodeURIComponent(id)}/price-validity`, 'PUT')
}
