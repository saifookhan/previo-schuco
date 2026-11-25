import type { NextResponse } from 'next/server'

import { proxyGetToApi } from '@/lib/api/server-client'

/** A quote with one of its versions (`?version=N`, default the latest). */
export const GET = async (request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> => {
  const { id } = await params
  return proxyGetToApi(request, `/api/sales-quotes/${id}`)
}
