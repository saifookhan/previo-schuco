import type { NextResponse } from 'next/server'

import { proxyEmpty, proxyJson } from '@/lib/api/proxy-patch'

type Params = { params: Promise<{ unitId: string }> }

export const PUT = async (request: Request, { params }: Params): Promise<NextResponse> =>
  proxyJson(request, `/api/company/business-units/${(await params).unitId}`, 'PUT')

export const DELETE = async (_request: Request, { params }: Params): Promise<NextResponse> =>
  proxyEmpty(`/api/company/business-units/${(await params).unitId}`, 'DELETE')
