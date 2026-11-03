import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies taking the family in or out of the company library ("In libreria"). */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyPatch(request, `/api/product-families/${encodeURIComponent(id)}/library`)
}
