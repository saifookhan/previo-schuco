import type { NextResponse } from 'next/server'

import { proxyEmpty, proxyJson } from '@/lib/api/proxy-patch'

type Params = { params: Promise<{ templateId: string }> }

export const PUT = async (request: Request, { params }: Params): Promise<NextResponse> =>
  proxyJson(request, `/api/company/text-templates/${(await params).templateId}`, 'PUT')

export const DELETE = async (_request: Request, { params }: Params): Promise<NextResponse> =>
  proxyEmpty(`/api/company/text-templates/${(await params).templateId}`, 'DELETE')
