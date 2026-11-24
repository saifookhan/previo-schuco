import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** One past save of a version, with its document. */
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string; revision: string }> },
): Promise<NextResponse> => {
  const { id, versionId, revision } = await params
  return proxyEmpty(`/api/sales-quotes/${id}/versions/${versionId}/revisions/${encodeURIComponent(revision)}`, 'GET')
}
