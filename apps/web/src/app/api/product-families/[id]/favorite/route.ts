import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Marks or clears this company's favorite on one product-family version. */
export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyJson(request, `/api/product-families/${encodeURIComponent(id)}/favorite`, 'POST')
}
