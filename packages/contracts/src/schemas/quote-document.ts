import { z } from 'zod'

import { isoDateSchema } from './product-family-import'

/**
 * The content of one quote version, edited as a whole in the quote builder and saved as one
 * document: the introduction's text modules, the product families with their lines (one row
 * each), the closing blocks and the print settings. Modeled on the client's "PREVIO — Demo
 * Preventivo" (Replit) data model.
 */

/** Client-made ids ("f-…", "l-…"): only unique within the document. */
const localIdSchema = z.string().min(1).max(64)

/** Rich text from the editor (TipTap HTML). The API sanitizes it before storing. */
const htmlSchema = z.string().max(1_000_000)

const nonNegative = z.number().finite().min(0)

export const vatRateSchema = z.enum(['22%', '10%', '4%', 'Es.'])
export type VatRate = z.infer<typeof vatRateSchema>

export const quoteTextModuleSchema = z.object({
  id: localIdSchema,
  html: htmlSchema,
})
export type QuoteTextModule = z.infer<typeof quoteTextModuleSchema>

/** The customer and project the quote is for, and its date. */
export const quoteHeaderSchema = z.object({
  customerName: z.string().trim().min(1).max(300),
  customerFiscalCode: z.string().max(100).nullable(),
  customerAddress: z.string().max(500).nullable(),
  customerCity: z.string().max(200).nullable(),
  projectLocation: z.string().max(500).nullable(),
  quoteDate: isoDateSchema,
  notes: z.string().max(5000),
})
export type QuoteHeader = z.infer<typeof quoteHeaderSchema>

/** One option picked for a catalog line ("Vetro: Triplo vetro"); names are snapshotted for printing. */
export const quoteLineOptionSchema = z.object({
  characteristicId: z.string().uuid(),
  subCharacteristicId: z.string().uuid(),
  name: z.string().max(300),
  value: z.string().max(300),
})
export type QuoteLineOption = z.infer<typeof quoteLineOptionSchema>

/**
 * One product line row. `unitPrice` (€/pz) is the catalog price of the line and its options
 * (with the family's or the share's discount and markup) when `priceMode` is 'catalog', and the
 * user's own value when 'manual' (always manual for a line not from the catalog).
 * Netto = unitPrice × (1 + extraMarkupPct/100) × (1 − discountPct/100); Totale = quantity × Netto.
 */
export const quoteLineSchema = z.object({
  id: localIdSchema,
  /** The "Pos" column ("P01", "1"…): free text. */
  code: z.string().max(10),
  /** The catalog line, or null for a line typed in by hand. */
  productLineId: z.string().uuid().nullable(),
  name: z.string().max(300),
  quantity: z.number().int().min(1).max(1_000_000),
  unit: z.string().max(20),
  widthMm: z.number().finite().positive().max(100_000).nullable(),
  heightMm: z.number().finite().positive().max(100_000).nullable(),
  options: z.array(quoteLineOptionSchema).max(100),
  priceMode: z.enum(['catalog', 'manual']),
  unitPrice: nonNegative.max(100_000_000),
  /** Extra markup on top of €/pz, in percent (5 = +5%); shown as 105 in the row. */
  extraMarkupPct: nonNegative.max(10_000),
  discountPct: nonNegative.max(100),
  vatRate: vatRateSchema,
  installationHours: nonNegative.max(100_000).nullable(),
  /** Frozen against edits in the builder; no effect on the price or the print. */
  locked: z.boolean(),
  /** Left out of its family's subtotal. */
  isAlternative: z.boolean(),
})
export type QuoteLine = z.infer<typeof quoteLineSchema>

export const quoteFamilySchema = z.object({
  id: localIdSchema,
  /** The catalog family (exact version) the lines are priced from, or null for a family typed in by hand. */
  productFamilyId: z.string().uuid().nullable(),
  name: z.string().max(300),
  /** Groups families in the closing's "summary by category". */
  category: z.string().max(200),
  /** Left out of the quote total. */
  isAlternative: z.boolean(),
  description: z.string().max(10_000),
  notes: z.string().max(10_000),
  lines: z.array(quoteLineSchema).max(500),
})
export type QuoteFamily = z.infer<typeof quoteFamilySchema>

export const paymentRowSchema = z.object({
  id: localIdSchema,
  description: z.string().max(500),
  pct: nonNegative.max(100),
})
export type PaymentRow = z.infer<typeof paymentRowSchema>

export const activityRowSchema = z.object({
  id: localIdSchema,
  description: z.string().max(500),
  /** "Incluse" (true) or "Non incluse" (false). */
  included: z.boolean(),
  /** Printed or not. */
  enabled: z.boolean(),
})
export type ActivityRow = z.infer<typeof activityRowSchema>

/** The blocks of "Riepilogo e Chiusura", in the order they print. */
export const closingBlockSchema = z.discriminatedUnion('type', [
  z.object({ id: localIdSchema, type: z.literal('familySummary') }),
  z.object({
    id: localIdSchema,
    type: z.literal('categorySummary'),
    /** Custom order of the categories; any not listed follow in family order. */
    categoryOrder: z.array(z.string().max(200)).max(200).optional(),
  }),
  z.object({ id: localIdSchema, type: z.literal('total') }),
  z.object({ id: localIdSchema, type: z.literal('text'), html: htmlSchema }),
  z.object({ id: localIdSchema, type: z.literal('payments'), rows: z.array(paymentRowSchema).max(50) }),
  z.object({ id: localIdSchema, type: z.literal('activities'), rows: z.array(activityRowSchema).max(200) }),
])
export type ClosingBlock = z.infer<typeof closingBlockSchema>
export type ClosingBlockType = ClosingBlock['type']

/** What the printed quote shows, and whose name and branch head it. */
export const quotePrintSettingsSchema = z.object({
  /** The sales contact ("Vostro referente") printed under the header; one of the company's users. */
  salesContactUserId: z.string().uuid().nullable(),
  /** The branch (business unit) whose logo, name and contacts head every page. */
  businessUnitId: z.string().uuid().nullable(),
  showSalesContact: z.boolean(),
  showImages: z.boolean(),
  showFamilyDescription: z.boolean(),
  showLineCharacteristics: z.boolean(),
  showExtraMarkup: z.boolean(),
  /** Forced on while any line has a discount. */
  showDiscount: z.boolean(),
  showFamilySummary: z.boolean(),
  showCategorySummary: z.boolean(),
  showTotal: z.boolean(),
  showPayments: z.boolean(),
  showActivities: z.boolean(),
  /**
   * Photos left out of the PDF. Missing or empty means every uploaded photo prints
   * (managed ones with the family, the rest at the end) while `showImages` is on.
   */
  excludedImageIds: z.array(z.string().uuid()).default([]),
})
export type QuotePrintSettings = z.infer<typeof quotePrintSettingsSchema>

export const defaultQuotePrintSettings: QuotePrintSettings = {
  salesContactUserId: null,
  businessUnitId: null,
  showSalesContact: true,
  showImages: true,
  showFamilyDescription: true,
  showLineCharacteristics: true,
  showExtraMarkup: false,
  showDiscount: true,
  showFamilySummary: true,
  showCategorySummary: true,
  showTotal: true,
  showPayments: true,
  showActivities: true,
  excludedImageIds: [],
}

export const quoteDocumentSchema = z.object({
  header: quoteHeaderSchema,
  intro: z.array(quoteTextModuleSchema).max(50),
  families: z.array(quoteFamilySchema).max(200),
  closing: z.array(closingBlockSchema).max(50),
  printSettings: quotePrintSettingsSchema,
})
export type QuoteDocument = z.infer<typeof quoteDocumentSchema>

// ── Calculations (the client's calculations.ts) ───────────────────────────────

/** Netto €: €/pz with the extra markup, then the discount. */
export const lineNetUnitPrice = (line: Pick<QuoteLine, 'unitPrice' | 'extraMarkupPct' | 'discountPct'>): number =>
  line.unitPrice * (1 + line.extraMarkupPct / 100) * (1 - line.discountPct / 100)

export const lineTotal = (line: Pick<QuoteLine, 'quantity' | 'unitPrice' | 'extraMarkupPct' | 'discountPct'>): number =>
  line.quantity * lineNetUnitPrice(line)

/** Total m² of the row (quantity × B × H), or null without a size. */
export const lineTotalM2 = (line: Pick<QuoteLine, 'quantity' | 'widthMm' | 'heightMm'>): number | null =>
  !line.widthMm || !line.heightMm ? null : line.quantity * (line.widthMm / 1000) * (line.heightMm / 1000)

/** The family's subtotal: its lines, without the alternative ones. */
export const familyTotal = (family: Pick<QuoteFamily, 'lines'>): number =>
  family.lines.filter((line) => !line.isAlternative).reduce((sum, line) => sum + lineTotal(line), 0)

/** Sup. totale: the m² of the family's lines, without the alternative ones. */
export const familyTotalM2 = (family: Pick<QuoteFamily, 'lines'>): number =>
  family.lines.filter((line) => !line.isAlternative).reduce((sum, line) => sum + (lineTotalM2(line) ?? 0), 0)

/** The quote total (VAT excluded): its families, without the alternative ones. */
export const quoteTotal = (document: Pick<QuoteDocument, 'families'>): number =>
  document.families.filter((family) => !family.isAlternative).reduce((sum, family) => sum + familyTotal(family), 0)

/**
 * Family subtotals grouped by category (a family without one goes under its own name), in
 * `order` first and then in family order. Alternative families are left out.
 */
export const totalsByCategory = (
  families: Pick<QuoteFamily, 'category' | 'name' | 'isAlternative' | 'lines'>[],
  order: string[] = [],
): { category: string; total: number }[] => {
  const totals = new Map<string, number>()
  for (const family of families.filter((f) => !f.isAlternative)) {
    const category = family.category.trim() || family.name.trim() || '—'
    totals.set(category, (totals.get(category) ?? 0) + familyTotal(family))
  }
  const ordered = order.filter((category) => totals.has(category))
  const rest = [...totals.keys()].filter((category) => !ordered.includes(category))
  return [...ordered, ...rest].map((category) => ({ category, total: totals.get(category) ?? 0 }))
}

/** True when the rich text has some visible text (not just empty paragraphs). */
export const hasVisibleText = (html: string): boolean => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0
