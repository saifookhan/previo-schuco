import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** Every save of a version, newest first. */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
): Promise<NextResponse> => {
  const { id, versionId } = await params
  return proxyEmpty(`/api/sales-quotes/${id}/versions/${versionId}/revisions`, 'GET')
}
