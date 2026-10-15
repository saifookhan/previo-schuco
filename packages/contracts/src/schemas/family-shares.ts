import { z } from 'zod'

/** A company that already holds, or can receive, a share of one family. */
export const familyShareDtoSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  discountPct: z.number().min(0).max(100),
})

export type FamilyShareDto = z.infer<typeof familyShareDtoSchema>

/** GET /api/product-families/:id/shares response: my current shares plus every company I could add. */
export const familySharesResponseSchema = z.object({
  shares: z.array(familyShareDtoSchema),
  targets: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
})

export type FamilySharesResponse = z.infer<typeof familySharesResponseSchema>

/** PUT /api/product-families/:id/shares body: the complete set of companies I share this family with. */
export const updateFamilySharesRequestSchema = z.object({
  shares: z
    .array(z.object({ companyId: z.string().uuid(), discountPct: z.number().min(0).max(100) }))
    .refine((shares) => new Set(shares.map((s) => s.companyId)).size === shares.length, {
      message: 'A company can appear only once',
    }),
})

export type UpdateFamilySharesRequest = z.infer<typeof updateFamilySharesRequestSchema>
