import type { NextResponse } from 'next/server'

import { proxyPatch } from '@/lib/api/proxy-patch'

/** Proxies the family's "Ready for invoicing" Yes/No. */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyPatch(request, `/api/product-families/${encodeURIComponent(id)}/ready-for-invoicing`)
}
