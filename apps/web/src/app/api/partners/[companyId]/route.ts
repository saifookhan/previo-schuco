import type { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

/** Withdraw my request to this company, or remove the connection with it. */
export const DELETE = async (
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<NextResponse> => {
  const { companyId } = await params
  return proxyEmpty(`/api/partners/${encodeURIComponent(companyId)}`, 'DELETE')
}
