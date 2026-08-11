import { z } from 'zod'

export const productTypeSchema = z.enum(['window', 'door', 'sliding', 'folding'])
export const glazingTypeSchema = z.enum(['double', 'triple', 'acoustic'])
export const securityLevelSchema = z.enum(['standard', 'enhanced', 'premium'])
export const colorFinishSchema = z.enum(['white', 'anthracite', 'silver', 'wood'])
export const localeSchema = z.enum(['it', 'en', 'de'])

export type ProductType = z.infer<typeof productTypeSchema>
export type GlazingType = z.infer<typeof glazingTypeSchema>
export type SecurityLevel = z.infer<typeof securityLevelSchema>
export type ColorFinish = z.infer<typeof colorFinishSchema>
export type Locale = z.infer<typeof localeSchema>

/** Product catalog item. */
export const productSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  nameEn: z.string(),
  nameIt: z.string(),
  nameDe: z.string(),
  baseRate: z.number(),
  imageUrl: z.string().nullable(),
})

export type Product = z.infer<typeof productSchema>

/** Quote configuration input for calculation. */
export const quoteConfigurationSchema = z.object({
  productType: productTypeSchema,
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  glazing: glazingTypeSchema,
  security: securityLevelSchema,
  color: colorFinishSchema,
  quantity: z.number().int().positive(),
})

export type QuoteConfiguration = z.infer<typeof quoteConfigurationSchema>

/** Quote line item in calculation breakdown. */
export const quoteLineItemSchema = z.object({
  label: z.string(),
  amount: z.number(),
})

/** Calculation result. */
export const quoteResultSchema = z.object({
  areaSqM: z.number(),
  lineItems: z.array(quoteLineItemSchema),
  subtotal: z.number(),
  vatRate: z.number(),
  vatAmount: z.number(),
  total: z.number(),
  currency: z.literal('EUR'),
  feasible: z.boolean(),
  feasibilityNotes: z.array(z.string()),
})

export type QuoteResult = z.infer<typeof quoteResultSchema>

/** Saved quote record. */
export const quoteSchema = z.object({
  id: z.number().int(),
  reference: z.string(),
  customerName: z.string(),
  customerEmail: z.string().nullable(),
  productType: z.string(),
  widthMm: z.number().int(),
  heightMm: z.number().int(),
  glazing: z.string(),
  security: z.string(),
  color: z.string(),
  quantity: z.number().int(),
  subtotal: z.number(),
  vatAmount: z.number(),
  total: z.number(),
  locale: z.string(),
  createdAt: z.string().datetime(),
})

export type Quote = z.infer<typeof quoteSchema>

/** Product family linked to a quote reference. */
export const productFamilySchema = z.object({
  id: z.number().int(),
  quoteReference: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  total: z.number(),
  isValid: z.boolean(),
  validityNote: z.string().nullable(),
  isAlternative: z.boolean(),
})

export type ProductFamily = z.infer<typeof productFamilySchema>

/** POST /api/quotes request body. */
export const createQuoteRequestSchema = quoteConfigurationSchema.extend({
  customerName: z.string().min(1),
  customerEmail: z.string().email().optional(),
  locale: localeSchema.default('it'),
})

export type CreateQuoteRequest = z.infer<typeof createQuoteRequestSchema>

/** POST /api/quotes response. */
export const createQuoteResponseSchema = z.object({
  quote: quoteSchema,
  calculation: quoteResultSchema,
})

export type CreateQuoteResponse = z.infer<typeof createQuoteResponseSchema>

/** GET /api/quotes/:reference response. */
export const quoteDetailResponseSchema = z.object({
  quote: quoteSchema,
  families: z.array(productFamilySchema),
})

export type QuoteDetailResponse = z.infer<typeof quoteDetailResponseSchema>

/** Calculation service validation response (Phase 3). */
export const validateConfigurationResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
})

export type ValidateConfigurationResponse = z.infer<typeof validateConfigurationResponseSchema>
