import { z } from 'zod'

/** The values a share gives the recipient for one product line or option: discount, markup ("out of 100", 100 = none) and installation hours per unit. */
export const familyShareValuesSchema = z.object({
  discountPct: z.number().min(0).max(100),
  markupPct: z.number().min(0).max(10000),
  installationHours: z.number().min(0).max(1_000_000),
})

export type FamilyShareValues = z.infer<typeof familyShareValuesSchema>

/** One product line or option (a sub-characteristic) of the family, with its values for one share. */
export const familyShareItemSchema = familyShareValuesSchema.extend({
  kind: z.enum(['line', 'option']),
  id: z.string().uuid(),
})

export type FamilyShareItemDto = z.infer<typeof familyShareItemSchema>

/** A company that already holds a share of the family, with what it gets for every line and option. */
export const familyShareDtoSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  items: z.array(familyShareItemSchema),
})

export type FamilyShareDto = z.infer<typeof familyShareDtoSchema>

/** A line or option of the family as the share dialog lists it, with the family's own values (the Excel's; 0/100/0 where it has none) as the default. */
export const familyShareableItemSchema = familyShareItemSchema.extend({
  name: z.string(),
  /** An option's characteristic, e.g. "Colore"; null for a line. */
  characteristicName: z.string().nullable(),
})

export type FamilyShareableItem = z.infer<typeof familyShareableItemSchema>

/** GET /api/product-families/:id/shares response. */
export const familySharesResponseSchema = z.object({
  /** Every line and option of this version, with its default values. */
  items: z.array(familyShareableItemSchema),
  /** My current shares of this version. */
  shares: z.array(familyShareDtoSchema),
  /** For a company I shared another version of this family with: those values, matched to this version's lines and options by name. The starting point when it is added here. */
  previous: z.array(z.object({ companyId: z.string().uuid(), items: z.array(familyShareItemSchema) })),
  /** Every company I could add. */
  targets: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
})

export type FamilySharesResponse = z.infer<typeof familySharesResponseSchema>

/** PUT /api/product-families/:id/shares body: the complete set of companies I share this family with; a line or option left out of `items` gets its default. */
export const updateFamilySharesRequestSchema = z.object({
  shares: z
    .array(
      z.object({
        companyId: z.string().uuid(),
        items: z
          .array(familyShareItemSchema)
          .refine((items) => new Set(items.map((item) => item.id)).size === items.length, {
            message: 'A line or option can appear only once',
          }),
      }),
    )
    .refine((shares) => new Set(shares.map((s) => s.companyId)).size === shares.length, {
      message: 'A company can appear only once',
    }),
})

export type UpdateFamilySharesRequest = z.infer<typeof updateFamilySharesRequestSchema>
