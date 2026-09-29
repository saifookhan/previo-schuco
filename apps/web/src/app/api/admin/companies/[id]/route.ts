import { proxyPatch } from '@/lib/api/proxy-patch'

/** Updates a company's own fields (super-admin only). */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  return proxyPatch(request, `/api/admin/companies/${id}`)
}
