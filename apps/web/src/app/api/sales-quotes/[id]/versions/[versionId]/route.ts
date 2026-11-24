import type { NextResponse } from 'next/server'

import { proxyJson } from '@/lib/api/proxy-patch'

/** Saves a version, fixed in place or as the next version. */
export const PUT = async (
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> => {
  const { id, versionId } = await params
  return proxyJson(request, `/api/sales-quotes/${id}/versions/${versionId}`, 'PUT')
}
