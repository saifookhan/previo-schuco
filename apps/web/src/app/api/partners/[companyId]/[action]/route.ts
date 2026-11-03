import { NextResponse } from 'next/server'

import { proxyEmpty } from '@/lib/api/proxy-patch'

const ACTIONS = new Set(['request', 'accept', 'reject'])

/** Ask a company to connect, or accept / refuse its request. */
export const POST = async (
  _request: Request,
  { params }: { params: Promise<{ companyId: string; action: string }> },
): Promise<NextResponse> => {
  const { companyId, action } = await params
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return proxyEmpty(`/api/partners/${encodeURIComponent(companyId)}/${action}`, 'POST')
}
