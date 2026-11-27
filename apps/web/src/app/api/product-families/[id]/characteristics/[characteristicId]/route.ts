import type { NextResponse } from 'next/server'

import { proxyEmpty, proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies a characteristic or option edit. */
export const PATCH = async (
  request: Request,
  { params }: { params: Promise<{ id: string; characteristicId: string }> },
): Promise<NextResponse> => {
  const { id, characteristicId } = await params
  return proxyPatch(request, `/api/product-families/${id}/characteristics/${characteristicId}`)
}

/** Proxies deleting a characteristic or option. */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; characteristicId: string }> },
): Promise<NextResponse> => {
  const { id, characteristicId } = await params
  return proxyEmpty(`/api/product-families/${id}/characteristics/${characteristicId}`, 'DELETE')
}
