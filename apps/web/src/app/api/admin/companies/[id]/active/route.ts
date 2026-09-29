import { proxyPatch } from '@/lib/api/proxy-patch'

/** Activates/deactivates a company (super-admin only). */
export const PATCH = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  return proxyPatch(request, `/api/admin/companies/${id}/active`)
}
