import { z } from 'zod'

/** One manufacturer → partner catalog link: the partner (a supplier or client) can see the manufacturer's published catalog. */
export const catalogLinkDtoSchema = z.object({
  manufacturerCompanyId: z.string().uuid(),
  manufacturerName: z.string(),
  partnerCompanyId: z.string().uuid(),
  partnerName: z.string(),
  createdAt: z.string().datetime(),
})

export type CatalogLinkDto = z.infer<typeof catalogLinkDtoSchema>

/** GET /api/admin/links response. */
export const catalogLinksListResponseSchema = z.object({
  links: z.array(catalogLinkDtoSchema),
})

export type CatalogLinksListResponse = z.infer<typeof catalogLinksListResponseSchema>

/** POST /api/admin/links request body. */
export const createCatalogLinkRequestSchema = z.object({
  manufacturerCompanyId: z.string().uuid(),
  partnerCompanyId: z.string().uuid(),
})

export type CreateCatalogLinkRequest = z.infer<typeof createCatalogLinkRequestSchema>
