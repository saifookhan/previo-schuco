import { z } from 'zod'

import { isoDateSchema } from './product-family-import'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)

/** Optional text. A blank string is stored as null. Absent stays absent on a partial update. */
const optionalText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullable()).optional()

const familyTextFields = {
  technicalName: optionalText(200),
  category: optionalText(200),
  brand: optionalText(200),
  distributor: optionalText(200),
  description1: optionalText(4000),
  description2: optionalText(4000),
  note: optionalText(8000),
}

const validToNotBeforeFrom = (value: { priceValidFrom: string; priceValidTo?: string | null }) =>
  !value.priceValidTo || value.priceValidTo >= value.priceValidFrom

const VALID_TO_MESSAGE = { message: '"Valid to" must be on or after "Valid from"', path: ['priceValidTo'] }

/** POST /api/product-families — an empty family, with no lines yet. */
export const createProductFamilyRequestSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200),
    ...familyTextFields,
    priceValidFrom: isoDateSchema,
    priceValidTo: z.preprocess(blankToNull, isoDateSchema.nullable()).optional(),
    publish: z.boolean().default(false),
    readyForInvoicing: z.boolean().default(false),
  })
  .refine(validToNotBeforeFrom, VALID_TO_MESSAGE)

export type CreateProductFamilyRequest = z.infer<typeof createProductFamilyRequestSchema>

/** PATCH /api/product-families/:id — family text only. Dates and flags have their own routes. */
export const updateProductFamilyDetailsSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(200).optional(),
    ...familyTextFields,
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'No editable fields provided',
  })

export type UpdateProductFamilyDetails = z.infer<typeof updateProductFamilyDetailsSchema>

const nullableNumber = z.union([z.number(), z.string(), z.null()])

export const formulaPriceSchema = z.object({
  kind: z.literal('formula'),
  formula: z.string(),
  value: z.union([z.number(), z.string()]),
})

export const matrixPriceSchema = z.object({
  kind: z.literal('matrix'),
  widths: z.array(z.number()),
  heights: z.array(z.number()),
  matrix: z.array(z.array(z.number().nullable())),
})

/** A line or option is priced by a formula plus a base value, or by a width × height table. */
export const priceModeSchema = z.discriminatedUnion('kind', [formulaPriceSchema, matrixPriceSchema])

export type PriceMode = z.infer<typeof priceModeSchema>

const lineEconomics = {
  minValue: nullableNumber.optional(),
  discountPct: nullableNumber.optional(),
  markupPct: nullableNumber.optional(),
  installationHoursPerUnit: nullableNumber.optional(),
}

/** PATCH /api/product-families/:id/lines/:lineId. The existing pricing fields stay accepted. */
export const updateProductLineRequestSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    unitName: z.string().optional(),
    unitSymbol: z.string().optional(),
    formula: z.string().optional(),
    value: z.union([z.number(), z.string()]).optional(),
    price: priceModeSchema.optional(),
    characteristicIds: z.array(z.string()).optional(),
    ...lineEconomics,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No editable fields provided' })

export type UpdateProductLineRequest = z.infer<typeof updateProductLineRequestSchema>

/** POST /api/product-families/:id/lines. */
export const createProductLineRequestSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  unitName: z.string(),
  unitSymbol: z.string(),
  price: priceModeSchema,
  characteristicIds: z.array(z.string()).optional(),
  ...lineEconomics,
})

export type CreateProductLineRequest = z.infer<typeof createProductLineRequestSchema>

/** PATCH /api/product-families/:id/characteristics/:characteristicId. */
export const updateCharacteristicRequestSchema = z
  .object({
    name: z.string().optional(),
    formula: z.string().nullable().optional(),
    value: z.union([z.number(), z.string(), z.null()]).optional(),
    price: priceModeSchema.optional(),
    ...lineEconomics,
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No editable fields provided' })

export type UpdateCharacteristicRequest = z.infer<typeof updateCharacteristicRequestSchema>

/**
 * POST /api/product-families/:id/characteristics.
 * No `parentId` (or null) creates a main characteristic. A parent id creates an option under it.
 */
export const createCharacteristicRequestSchema = z.object({
  name: z.string(),
  parentId: z.string().nullable().optional(),
  price: priceModeSchema.optional(),
  ...lineEconomics,
})

export type CreateCharacteristicRequest = z.infer<typeof createCharacteristicRequestSchema>

/** PATCH /api/product-families/:id/images/:imageId. */
export const updateProductFamilyImageRequestSchema = z.object({
  title: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
})

export type UpdateProductFamilyImageRequest = z.infer<typeof updateProductFamilyImageRequestSchema>
