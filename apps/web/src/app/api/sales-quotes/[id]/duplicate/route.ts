import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Copies one variant into a new quote's V1A1. */
export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyJson(request, `/api/sales-quotes/${id}/duplicate`, 'POST')
}
