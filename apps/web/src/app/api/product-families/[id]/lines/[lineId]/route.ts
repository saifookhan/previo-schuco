import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies a product-line pricing edit. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
): Promise<NextResponse> => {
  const { id, lineId } = await params
  return proxyPatch(request, `/api/product-families/${id}/lines/${lineId}`)
}
