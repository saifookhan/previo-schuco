import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies a sub-characteristic pricing edit. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; characteristicId: string }> },
): Promise<NextResponse> => {
  const { id, characteristicId } = await params
  return proxyPatch(request, `/api/product-families/${id}/characteristics/${characteristicId}`)
}
