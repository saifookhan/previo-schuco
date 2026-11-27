import { proxyFormDataToApi } from '@/lib/api/server-client'

/** Uploads a picture into a product-family image slot. */
export const POST = async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  const { id } = await params
  return proxyFormDataToApi(request, `/api/product-families/${encodeURIComponent(id)}/images`)
}
