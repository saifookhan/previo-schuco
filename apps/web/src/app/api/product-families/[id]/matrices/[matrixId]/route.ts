import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies a pricing-matrix edit (widths/heights/cells). */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; matrixId: string }> },
): Promise<NextResponse> => {
  const { id, matrixId } = await params
  return proxyPatch(request, `/api/product-families/${id}/matrices/${matrixId}`)
}
