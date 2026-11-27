import { z } from 'zod'

import { businessUnitSchema, companyProfileSchema, salesContactSchema } from './company-profile'
import { quoteDocumentSchema, quoteHeaderSchema } from './quote-document'

export const quoteStatusSchema = z.enum(['draft', 'sent', 'accepted', 'rejected'])
export type QuoteStatus = z.infer<typeof quoteStatusSchema>

/** A version can be fixed in place only while it is a draft; a sent, accepted or rejected one only gets a new version. */
export const isEditableQuoteStatus = (status: QuoteStatus): boolean => status === 'draft'

/** One quote in the quotes list: its latest version's customer, status and total. */
export const quoteSummarySchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: quoteStatusSchema,
  customerName: z.string(),
  projectLocation: z.string().nullable(),
  totalPrice: z.string(),
  latestVersion: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Latest version's `sent_at`, when that version has been sent. */
  sentAt: z.string().datetime().nullable(),
  /** User who created the quote, when the row still points at one. */
  createdByUserId: z.string().uuid().nullable(),
})
export type QuoteSummary = z.infer<typeof quoteSummarySchema>

export const quoteUserRefSchema = z.object({ id: z.string().uuid(), name: z.string().nullable() }).nullable()

/** One version in the version switcher. */
export const quoteVersionRefSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  status: quoteStatusSchema,
  totalPrice: z.string(),
  updatedAt: z.string().datetime(),
})
export type QuoteVersionRef = z.infer<typeof quoteVersionRefSchema>

export const quoteVersionSchema = z.object({
  id: z.string().uuid(),
  quoteId: z.string().uuid(),
  version: z.number().int(),
  status: quoteStatusSchema,
  /** How many times it was saved; a save must name the revision it was based on. */
  revision: z.number().int(),
  document: quoteDocumentSchema,
  totalPrice: z.string(),
  createdBy: quoteUserRefSchema,
  updatedBy: quoteUserRefSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
})
export type QuoteVersion = z.infer<typeof quoteVersionSchema>

/**
 * Whether a catalog family used by the version can still price it: `current` (valid today),
 * `expired`/`upcoming` (its price validity), `unpublished`. For an expired or unpublished family,
 * `replacement` is the newest version of it that is valid today, if any.
 */
export const quoteFamilyStatusSchema = z.object({
  productFamilyId: z.string().uuid(),
  name: z.string(),
  version: z.number().int(),
  status: z.enum(['current', 'expired', 'upcoming', 'unpublished']),
  priceValidTo: z.string().nullable(),
  replacement: z.object({ id: z.string().uuid(), version: z.number().int(), name: z.string() }).nullable(),
})
export type QuoteFamilyStatus = z.infer<typeof quoteFamilyStatusSchema>

/** GET /api/sales-quotes/:id(?version=n) */
export const salesQuoteDetailResponseSchema = z.object({
  quote: quoteSummarySchema,
  versions: z.array(quoteVersionRefSchema),
  version: quoteVersionSchema,
  familyStatus: z.array(quoteFamilyStatusSchema),
})
export type SalesQuoteDetailResponse = z.infer<typeof salesQuoteDetailResponseSchema>

/** POST /api/sales-quotes */
export const createSalesQuoteRequestSchema = z.object({
  reference: z.string().trim().min(1).max(100),
  header: quoteHeaderSchema.partial({ quoteDate: true, notes: true }),
})
export type CreateSalesQuoteRequest = z.infer<typeof createSalesQuoteRequestSchema>

/**
 * PUT /api/sales-quotes/:id/versions/:versionId — `update` fixes this version in place (drafts
 * only), `newVersion` saves the document as the next version and leaves this one as it was.
 */
export const saveQuoteRequestSchema = z.object({
  document: quoteDocumentSchema,
  mode: z.enum(['update', 'newVersion']),
  /** The revision the edits started from; a save over a newer one is refused. */
  baseRevision: z.number().int().min(1),
})
export type SaveQuoteRequest = z.infer<typeof saveQuoteRequestSchema>

/** PATCH /api/sales-quotes/:id/versions/:versionId/status */
export const setQuoteStatusRequestSchema = z.object({ status: quoteStatusSchema })
export type SetQuoteStatusRequest = z.infer<typeof setQuoteStatusRequestSchema>

/** POST /api/sales-quotes/price-lines — the catalog €/pz of lines, as they would be saved. */
export const priceLinesRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        /** Echoed back, to match each result to its row. */
        key: z.string().min(1).max(64),
        productFamilyId: z.string().uuid(),
        productLineId: z.string().uuid(),
        widthMm: z.number().finite().positive().nullable(),
        heightMm: z.number().finite().positive().nullable(),
        options: z.array(z.object({ characteristicId: z.string().uuid(), subCharacteristicId: z.string().uuid() })).max(100),
      }),
    )
    .min(1)
    .max(500),
})
export type PriceLinesRequest = z.infer<typeof priceLinesRequestSchema>

export const pricedLineSchema = z.discriminatedUnion('ok', [
  z.object({
    key: z.string(),
    ok: z.literal(true),
    /** €/pz: the line and its options, after the discount and markup they are priced at. */
    unitPrice: z.number(),
    /** Per unit: the line's plus each option's. */
    installationHours: z.number(),
    unit: z.string(),
    minApplied: z.boolean(),
  }),
  z.object({ key: z.string(), ok: z.literal(false), error: z.string() }),
])
export type PricedLine = z.infer<typeof pricedLineSchema>

export const priceLinesResponseSchema = z.object({ lines: z.array(pricedLineSchema) })
export type PriceLinesResponse = z.infer<typeof priceLinesResponseSchema>

/** What one save changed, for the history ("Riga P02: Q.tà 2 → 3"). */
export const quoteChangeSchema = z.object({
  kind: z.enum([
    'header',
    'intro',
    'family_added',
    'family_removed',
    'family_changed',
    'families_reordered',
    'line_added',
    'line_removed',
    'line_changed',
    'lines_reordered',
    'closing',
    'print_settings',
  ]),
  family: z.string().optional(),
  line: z.string().optional(),
  field: z.string().optional(),
  from: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  to: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
})
export type QuoteChange = z.infer<typeof quoteChangeSchema>

/** One save of a version, newest first. */
export const quoteRevisionSchema = z.object({
  revision: z.number().int(),
  savedAt: z.string().datetime(),
  savedBy: quoteUserRefSchema,
  totalPrice: z.string(),
  /** Empty for a new quote's first revision; for a new version's first revision, the changes from the version it was made from. */
  changes: z.array(quoteChangeSchema),
  /** For a version's first revision: the version it was created from, if any. */
  fromVersion: z.number().int().nullable(),
})
export type QuoteRevision = z.infer<typeof quoteRevisionSchema>

export const quoteRevisionsResponseSchema = z.object({ revisions: z.array(quoteRevisionSchema) })
export type QuoteRevisionsResponse = z.infer<typeof quoteRevisionsResponseSchema>

/** GET /api/sales-quotes/:id/versions/:versionId/revisions/:revision — one past save, to look at. */
export const quoteRevisionDetailSchema = quoteRevisionSchema.extend({ document: quoteDocumentSchema })
export type QuoteRevisionDetail = z.infer<typeof quoteRevisionDetailSchema>

/** GET /api/sales-quotes/:id/print(?version=n) — everything the printed quote shows. */
export const quotePrintDataSchema = z.object({
  quote: quoteSummarySchema,
  version: quoteVersionSchema,
  company: companyProfileSchema,
  /** The branch heading the pages: the one chosen in the print settings, else the company's first. */
  businessUnit: businessUnitSchema.nullable(),
  salesContact: salesContactSchema.nullable(),
})
export type QuotePrintData = z.infer<typeof quotePrintDataSchema>
