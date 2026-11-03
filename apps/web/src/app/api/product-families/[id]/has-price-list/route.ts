import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies the family's "Con listino" Yes/No. */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyPatch(request, `/api/product-families/${encodeURIComponent(id)}/has-price-list`)
}
