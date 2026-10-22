import { z } from 'zod'

/**
 * Price lists are Italian business documents: "valid until 31 Dec" means until the end of
 * that day in Italy, whatever timezone the server runs in.
 */
export const PRICE_VALIDITY_TIMEZONE = 'Europe/Rome'

/** Today's date (`YYYY-MM-DD`) in `PRICE_VALIDITY_TIMEZONE`. */
export const priceValidityToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: PRICE_VALIDITY_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

export type PriceValidityStatus = 'current' | 'upcoming' | 'expired'

/**
 * Where `day` falls in a family's price validity. Both ends are inclusive; a null end is open
 * (families imported before validity existed have neither, so they are always current).
 */
export const priceValidityStatus = (
  family: { priceValidFrom: string | null; priceValidTo: string | null },
  day: string = priceValidityToday(),
): PriceValidityStatus => {
  if (family.priceValidFrom && day < family.priceValidFrom) return 'upcoming'
  if (family.priceValidTo && day > family.priceValidTo) return 'expired'
  return 'current'
}

const isRealDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD')
  .refine(isRealDate, 'Not a valid date')

const validToNotBeforeFrom = (value: { priceValidFrom: string; priceValidTo?: string | null }) =>
  !value.priceValidTo || value.priceValidTo >= value.priceValidFrom

const VALID_TO_MESSAGE = { message: '"Valid to" must be on or after "Valid from"', path: ['priceValidTo'] }

/** PUT /api/product-families/:id/price-validity body. */
export const priceValidityRequestSchema = z
  .object({ priceValidFrom: isoDateSchema, priceValidTo: isoDateSchema.nullable() })
  .refine(validToNotBeforeFrom, VALID_TO_MESSAGE)

export type PriceValidityRequest = z.infer<typeof priceValidityRequestSchema>

/** A blank multipart text field means "not given". */
const optionalField = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional())

/**
 * The text fields sent next to `file` when saving an upload (POST /api/product-families/import
 * and /:id/new-version, multipart): what the user confirmed in the upload dialog.
 */
export const productFamilyImportFieldsSchema = z
  .object({
    /** Overrides the workbook's family name; blank keeps the workbook's. */
    name: optionalField(z.string().trim().max(200)),
    priceValidFrom: isoDateSchema,
    priceValidTo: optionalField(isoDateSchema),
    publish: optionalField(z.enum(['true', 'false'])).transform((value) => value === 'true'),
  })
  .refine(validToNotBeforeFrom, VALID_TO_MESSAGE)

export type ProductFamilyImportFields = z.infer<typeof productFamilyImportFieldsSchema>

/** Something in the workbook that will be skipped or looks wrong, but doesn't stop the import. */
export const productFamilyImportWarningSchema = z.discriminatedUnion('code', [
  /** A "Relations" row names a product line the "Product lines" sheet doesn't have — the row is skipped. */
  z.object({ code: z.literal('relationUnknownLine'), productLine: z.string(), characteristic: z.string() }),
  /** A "Relations" row names a characteristic the "Caracteristics" sheet doesn't have — the row is skipped. */
  z.object({ code: z.literal('relationUnknownCharacteristic'), productLine: z.string(), characteristic: z.string() }),
  /** Two product lines share a name; "Relations" rows for that name only reach the last one. */
  z.object({ code: z.literal('duplicateLineName'), productLine: z.string() }),
  /** Two main characteristics share a name; "Relations" rows for that name only reach the last one. */
  z.object({ code: z.literal('duplicateCharacteristicName'), characteristic: z.string() }),
])

export type ProductFamilyImportWarning = z.infer<typeof productFamilyImportWarningSchema>

/** POST /api/product-families/import/preview response: what the workbook holds. Nothing is saved. */
export const productFamilyImportPreviewSchema = z.object({
  fileName: z.string(),
  family: z.object({
    name: z.string(),
    technicalName: z.string().nullable(),
    category: z.string().nullable(),
    brand: z.string().nullable(),
  }),
  counts: z.object({
    productLines: z.number().int(),
    characteristics: z.number().int(),
    options: z.number().int(),
    priceTables: z.number().int(),
    relations: z.number().int(),
    images: z.number().int(),
  }),
  warnings: z.array(productFamilyImportWarningSchema),
})

export type ProductFamilyImportPreview = z.infer<typeof productFamilyImportPreviewSchema>
