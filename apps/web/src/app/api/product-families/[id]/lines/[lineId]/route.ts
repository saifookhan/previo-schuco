import type { NextResponse } from 'next/server'

import { proxyEmpty, proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies a product-line edit. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
): Promise<NextResponse> => {
  const { id, lineId } = await params
  return proxyPatch(request, `/api/product-families/${id}/lines/${lineId}`)
}

/** Proxies deleting a product line. */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
): Promise<NextResponse> => {
  const { id, lineId } = await params
  return proxyEmpty(`/api/product-families/${id}/lines/${lineId}`, 'DELETE')
}
