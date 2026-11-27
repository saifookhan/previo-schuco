import {
  getBusinessUnitLogo,
  getCompanyProfile,
  getIncomingShareItems,
  getProductFamilyById,
  getProductFamilyDetail,
  getQuoteRevision,
  getQuoteRow,
  getQuoteVersion,
  getQuoteVersionById,
  insertQuote,
  insertQuoteRevision,
  insertQuoteVersion,
  isFamilySharedWith,
  isProductFamilyInLibrary,
  listFamiliesHiddenFromLibrary,
  listFamiliesSharedWith,
  listBusinessUnitsWithUsers,
  listProductFamilyVersionsOfChains,
  listQuoteRevisions,
  listQuoteVersionRows,
  listQuoteVariantsForQuotes,
  listQuoteVersions,
  listQuotes,
  listSalesContacts,
  lockQuote,
  quoteExists,
  setQuoteArchivedAt,
  setQuoteVersionFavorite,
  setQuoteVersionFinal,
  setQuoteVersionLabel,
  setQuoteVersionStatus,
  updateQuoteSummary,
  updateQuoteVersionDocument,
  userMayArchive,
  type DbLike,
  type ListQuotesFilter,
  type QuoteRow,
  type QuoteVariantListRow,
  type QuoteVersionRow,
  type QuoteVersionWithUsers,
} from '@schuco/db'
import { computeCharacteristicPrice, computeLinePrice, type PricingMatrix } from '@schuco/calculation'
import {
  defaultQuotePrintSettings,
  isEditableQuoteStatus,
  priceValidityStatus,
  priceValidityToday,
  quoteDocumentSchema,
  quoteTotal,
  type AuditLogListResponse,
  type ClosingBlock,
  type CreateQuoteAlternativeRequest,
  type CreateSalesQuoteRequest,
  type DuplicateSalesQuoteRequest,
  type PriceLinesRequest,
  type PricedLine,
  type QuoteChange,
  type QuoteDocument,
  type QuoteFamilyStatus,
  type QuoteRevision,
  type QuoteRevisionDetail,
  type QuoteStatus,
  type QuoteSummary,
  type QuoteVersion,
  type RecordHistoryQuery,
  type QuotePrintData,
  type QuoteVariantRef,
  type SalesQuoteDetailResponse,
  type SaveQuoteRequest,
  type SetQuoteVariantLabelRequest,
} from '@schuco/contracts'

import { diffQuoteDocuments } from '../lib/quote-diff'
import { sanitizeRichText } from '../lib/sanitize-rich-text'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { listAuditPage, recordAuditEvent, toHistoryEntry } from './audit-service'

export interface QuoteActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

/** The request references a product family/line/characteristic that doesn't exist or isn't visible to the caller, or the numbers don't make sense. */
export class QuoteValidationError extends Error {}

/** The version was saved by someone else since the caller loaded it (`baseRevision` is stale). */
export class QuoteConflictError extends Error {}

/** The caller can see the quote but isn't allowed to archive it. */
export class QuoteForbiddenError extends Error {}

type ProductFamilyDetail = NonNullable<Awaited<ReturnType<typeof getProductFamilyDetail>>>

const auditActor = (actor: QuoteActor) => ({
  actorType: 'user' as const,
  actorUserId: actor.actorUserId,
  actorCompanyId: actor.actorCompanyId,
  requestId: actor.requestId,
})

// ── Catalog pricing ───────────────────────────────────────────────────────────

const asMatrix = (widths: number[], heights: number[], matrix: (number | null)[][]): PricingMatrix => ({
  widths,
  heights,
  matrix,
})

/** A family the company may price quote lines from: its own, or a published one shared with it. */
const loadPricingFamily = async (tx: DbLike, companyId: string, familyId: string): Promise<ProductFamilyDetail> => {
  const family = await getProductFamilyDetail(tx, familyId)
  // A quote belongs to the supplier issuing it. It may be priced from that
  // company's own catalog, or from a PUBLISHED family that was shared with
  // the company, directly or through a chain (product_family_shares). A
  // family merely visible for another reason is not enough. No isSuperAdmin
  // exception: isSuperAdmin stays true while acting as another tenant via
  // X-Tenant-Id (ADR 0008), so a bypass here would let a super-admin acting
  // as company A attach an arbitrary company's family to a quote owned by A;
  // they must act as the supplier itself and pass this same check.
  const usable =
    !!family &&
    (family.family.supplierCompanyId === companyId ||
      (family.family.isPublished && (await isFamilySharedWith(tx, family.family.id, companyId))))
  if (!family || !usable) {
    throw new QuoteValidationError('Product family not found or not visible')
  }
  return family
}

/**
 * New lines may only use a family that is in the quoting company's library and ready for
 * invoicing; and no line (new or kept) may use one whose prices aren't valid today (Italian
 * time) — an expired family has to be replaced by a newer version of it.
 * @throws {QuoteValidationError} the family is out of the company's library, isn't ready for invoicing, or its price validity hasn't started yet or has ended
 */
const assertFamilyUsable = async (
  tx: DbLike,
  companyId: string,
  family: ProductFamilyDetail['family'],
  { isNew }: { isNew: boolean },
): Promise<void> => {
  if (isNew) {
    if (family.archivedAt) {
      throw new QuoteValidationError(`"${family.name}" is archived`)
    }
    if (!(await isProductFamilyInLibrary(tx, companyId, family.id))) {
      throw new QuoteValidationError(`"${family.name}" is not in your company's library`)
    }
    if (!family.readyForInvoicing) {
      throw new QuoteValidationError(`"${family.name}" is not ready for invoicing`)
    }
  }
  const validity = priceValidityStatus(family, priceValidityToday())
  if (validity === 'upcoming') {
    throw new QuoteValidationError(`The prices of "${family.name}" are valid from ${family.priceValidFrom}`)
  }
  if (validity === 'expired') {
    throw new QuoteValidationError(
      `The prices of "${family.name}" expired on ${family.priceValidTo}: switch to a newer version of it, or upload one`,
    )
  }
}

export interface CatalogLineInput {
  productLineId: string
  widthMm: number | null
  heightMm: number | null
  options: { characteristicId: string; subCharacteristicId: string }[]
}

export interface PricedCatalogLine {
  /** €/pz: the line and each option, each after the discount and markup it is priced at. */
  unitPrice: number
  /** Per unit: the line's plus each option's. */
  installationHours: number
  unit: string
  lineName: string
  minApplied: boolean
  options: { characteristicId: string; subCharacteristicId: string; name: string; value: string }[]
  /** How `unitPrice` was reached: the line's and each option's price before discount and markup, and the ones applied to it. */
  breakdown: {
    line: { basePrice: number; discountPct: number; markupPct: number }
    options: { basePrice: number; discountPct: number; markupPct: number }[]
  }
}

type ShareItems = Awaited<ReturnType<typeof getIncomingShareItems>>

/**
 * What the family's share gives the company, loaded once per loaded family (callers load each
 * family once per request), not once per line.
 */
const shareItemsCache = new WeakMap<ProductFamilyDetail, Map<string, Promise<ShareItems>>>()
const shareItemsFor = (tx: DbLike, companyId: string, family: ProductFamilyDetail): Promise<ShareItems> => {
  let byCompany = shareItemsCache.get(family)
  if (!byCompany) {
    byCompany = new Map()
    shareItemsCache.set(family, byCompany)
  }
  let items = byCompany.get(companyId)
  if (!items) {
    items = getIncomingShareItems(tx, companyId, family.family.id)
    byCompany.set(companyId, items)
  }
  return items
}

/**
 * The €/pz of one catalog line at its size with its options, with the shared costing engine
 * (`@schuco/calculation`, the same code the catalog itself is priced with). The line and each
 * option are priced at their own discount and markup: the share's when the family is shared
 * with the company, otherwise the family's own (an option without its own takes the line's).
 * @throws {QuoteValidationError} no size, a line/option not in the family, or the engine can't price it
 */
export const priceCatalogLine = async (
  tx: DbLike,
  companyId: string,
  family: ProductFamilyDetail,
  input: CatalogLineInput,
): Promise<PricedCatalogLine> => {
  const line = family.lines.find((l) => l.id === input.productLineId)
  if (!line) {
    throw new QuoteValidationError('Product line not found in this family')
  }
  if (!input.widthMm || !input.heightMm) {
    throw new QuoteValidationError(`"${line.name}" needs a width and a height to be priced`)
  }
  const widthMm = input.widthMm
  const heightMm = input.heightMm
  const matrixById = new Map(family.matrices.map((m) => [m.id, m]))

  const selections = input.options.map((selection) => {
    const main = family.characteristics.find((c) => c.id === selection.characteristicId && !c.parentId)
    const sub = family.characteristics.find(
      (c) => c.id === selection.subCharacteristicId && c.parentId === selection.characteristicId,
    )
    if (!main || !sub) {
      throw new QuoteValidationError(`Option ${selection.characteristicId}/${selection.subCharacteristicId} not found in this family`)
    }
    return { main, sub }
  })

  // On a family shared with this company, each line and option starts at what the share gives it
  // (discount, markup, installation hours) instead of the family's own values; one the share has
  // no values for keeps the family's.
  const shareItems = family.family.supplierCompanyId === companyId ? null : await shareItemsFor(tx, companyId, family)
  const lineShare = shareItems?.get(line.id)
  const lineHours = lineShare?.installationHours ?? Number(line.installationHoursPerUnit ?? 0)
  // The line's installation hours plus what each chosen option adds (v2 options have their own
  // "Ore di posa"). An "Ore di posa x [€/h]" option is priced on these hours; the line's own
  // formula keeps the line's hours, so labour isn't charged on both.
  const installationHours =
    lineHours +
    selections.reduce((sum, { sub }) => sum + (shareItems?.get(sub.id)?.installationHours ?? Number(sub.installationHoursPerUnit ?? 0)), 0)

  const lineMatrix = line.pricingMatrixId ? matrixById.get(line.pricingMatrixId) : undefined
  if (line.pricingMatrixId && !lineMatrix) {
    throw new QuoteValidationError('Line references a pricing matrix that no longer exists')
  }
  let lineBasePrice: number
  let minApplied = false
  try {
    const lineCost = computeLinePrice(
      {
        value: Number(line.value),
        formula: line.formula,
        pricingMatrix: lineMatrix ? asMatrix(lineMatrix.widths, lineMatrix.heights, lineMatrix.matrix) : null,
        minValue: line.minValue == null ? null : Number(line.minValue),
        installationHoursPerUnit: lineHours,
        discountPct: 0,
        markupPct: 100,
      },
      widthMm,
      heightMm,
    )
    lineBasePrice = lineCost.basePrice
    minApplied = lineCost.minApplied
  } catch (error) {
    throw new QuoteValidationError(`Could not price "${line.name}" at ${widthMm}x${heightMm}mm: ${(error as Error).message}`)
  }

  const discountPct = lineShare?.discountPct ?? Number(line.discountPct ?? 0)
  const markupPct = lineShare?.markupPct ?? Number(line.markupPct ?? 100)
  let unitPrice = lineBasePrice * (1 - discountPct / 100) * (markupPct / 100)
  const optionPrices: PricedCatalogLine['breakdown']['options'] = []

  for (const { main, sub } of selections) {
    const subMatrix = sub.pricingMatrixId ? matrixById.get(sub.pricingMatrixId) : undefined
    if (sub.pricingMatrixId && !subMatrix) {
      throw new QuoteValidationError('Selected option references a pricing matrix that no longer exists')
    }
    let subPrice = 0
    // An option with no formula/value and no matrix is a free/included option (e.g. a default
    // color) — costs nothing, same as the reference workbook's blank-price rows.
    if (subMatrix || sub.formula) {
      try {
        const result = computeCharacteristicPrice(
          {
            value: sub.value == null ? 0 : Number(sub.value),
            formula: sub.formula ?? 'valore',
            pricingMatrix: subMatrix ? asMatrix(subMatrix.widths, subMatrix.heights, subMatrix.matrix) : null,
            minValue: sub.minValue == null ? null : Number(sub.minValue),
            installationHoursPerUnit: installationHours,
            discountPct: 0,
            markupPct: 100,
          },
          widthMm,
          heightMm,
          lineBasePrice,
        )
        subPrice = result.basePrice
        minApplied ||= result.minApplied
      } catch (error) {
        throw new QuoteValidationError(`Could not price "${main.name}: ${sub.name}": ${(error as Error).message}`)
      }
    }
    // An option has its own discount and markup when the share gives it some, or (v2) the family
    // does; otherwise the line's apply to it.
    const optionShare = shareItems?.get(sub.id)
    const ownDiscountPct = optionShare?.discountPct ?? (sub.discountPct == null ? null : Number(sub.discountPct))
    const ownMarkupPct = optionShare?.markupPct ?? (sub.markupPct == null ? null : Number(sub.markupPct))
    const option = { basePrice: subPrice, discountPct: ownDiscountPct ?? discountPct, markupPct: ownMarkupPct ?? markupPct }
    optionPrices.push(option)
    unitPrice += option.basePrice * (1 - option.discountPct / 100) * (option.markupPct / 100)
  }

  return {
    unitPrice: Math.round(unitPrice * 10_000) / 10_000,
    installationHours,
    unit: line.unitSymbol,
    lineName: line.name,
    minApplied,
    options: selections.map(({ main, sub }) => ({
      characteristicId: main.id,
      subCharacteristicId: sub.id,
      name: main.name,
      value: sub.name,
    })),
    breakdown: { line: { basePrice: lineBasePrice, discountPct, markupPct }, options: optionPrices },
  }
}

/**
 * The catalog €/pz of each line, as a save would store it — for the builder's live prices. A
 * line that can't be priced gets its error instead; the others are still priced.
 */
export const priceQuoteLines = (ctx: TenantContext, input: PriceLinesRequest): Promise<PricedLine[]> =>
  withTenantDb(ctx, async (tx) => {
    const families = new Map<string, Promise<ProductFamilyDetail>>()
    const loadFamily = (id: string) => {
      if (!families.has(id)) {
        families.set(
          id,
          loadPricingFamily(tx, ctx.effectiveCompanyId, id).then(async (family) => {
            await assertFamilyUsable(tx, ctx.effectiveCompanyId, family.family, { isNew: false })
            return family
          }),
        )
      }
      return families.get(id)!
    }
    const results: PricedLine[] = []
    // One at a time: they share the transaction's single connection.
    for (const line of input.lines) {
      try {
        const family = await loadFamily(line.productFamilyId)
        const priced = await priceCatalogLine(tx, ctx.effectiveCompanyId, family, line)
        results.push({
          key: line.key,
          ok: true,
          unitPrice: priced.unitPrice,
          installationHours: priced.installationHours,
          unit: priced.unit,
          minApplied: priced.minApplied,
        })
      } catch (error) {
        if (!(error instanceof QuoteValidationError)) throw error
        results.push({ key: line.key, ok: false, error: error.message })
      }
    }
    return results
  })

// ── Reading ───────────────────────────────────────────────────────────────────

const toVariantRef = (row: QuoteVariantListRow): QuoteVariantRef => ({
  id: row.id,
  version: row.version,
  alternative: row.alternative,
  label: row.label,
  isFinal: row.isFinal,
  isFavorite: row.isFavorite,
  status: row.status,
  totalPrice: row.totalPrice,
  updatedAt: row.updatedAt.toISOString(),
})

const toSummary = (quote: QuoteRow, variants: QuoteVariantListRow[]): QuoteSummary => ({
  id: quote.id,
  reference: quote.reference,
  status: quote.status,
  customerName: quote.customerName,
  projectLocation: quote.projectLocation,
  totalPrice: quote.totalPrice,
  latestVersion: quote.latestVersion,
  archivedAt: quote.archivedAt?.toISOString() ?? null,
  variants: variants.map(toVariantRef),
  createdAt: quote.createdAt.toISOString(),
  updatedAt: quote.updatedAt.toISOString(),
})

const toVersion = (row: QuoteVersionWithUsers): QuoteVersion => ({
  id: row.id,
  quoteId: row.quoteId,
  version: row.version,
  alternative: row.alternative,
  label: row.label,
  isFinal: row.isFinal,
  isFavorite: row.isFavorite,
  status: row.status,
  revision: row.revision,
  document: quoteDocumentSchema.parse(row.document),
  totalPrice: row.totalPrice,
  createdBy: row.createdByUserId ? { id: row.createdByUserId, name: row.createdByName } : null,
  updatedBy: row.updatedByUserId ? { id: row.updatedByUserId, name: row.updatedByName } : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  sentAt: row.sentAt?.toISOString() ?? null,
})

const catalogFamilyIds = (document: QuoteDocument): string[] => [
  ...new Set(document.families.map((family) => family.productFamilyId).filter((id): id is string => id !== null)),
]

/**
 * Whether each catalog family the document uses can still price it, and for one that can't
 * (expired, or no longer published), the newest version of it the company could quote from today.
 */
const familyStatuses = async (tx: DbLike, companyId: string, document: QuoteDocument): Promise<QuoteFamilyStatus[]> => {
  const ids = catalogFamilyIds(document)
  if (ids.length === 0) return []
  const today = priceValidityToday()
  const chains = await listProductFamilyVersionsOfChains(tx, ids)
  type ChainFamily = NonNullable<Awaited<ReturnType<typeof getProductFamilyById>>>
  type Candidate = NonNullable<ReturnType<typeof chains.get>>[number]
  const rows: { family: ChainFamily | Candidate; status: QuoteFamilyStatus['status']; candidates: Candidate[] }[] = []
  for (const id of ids) {
    const family = (chains.get(id) ?? []).find((f) => f.id === id) ?? (await getProductFamilyById(tx, id))
    if (!family) continue
    const validity = priceValidityStatus(family, today)
    const status: QuoteFamilyStatus['status'] =
      validity !== 'current' ? validity : family.supplierCompanyId !== companyId && !family.isPublished ? 'unpublished' : 'current'
    // Newest first: the versions after it that could price the quote today.
    const candidates =
      status === 'expired' || status === 'unpublished'
        ? (chains.get(id) ?? [])
            .filter(
              (f) =>
                f.version > family.version &&
                f.readyForInvoicing &&
                priceValidityStatus(f, today) === 'current' &&
                (f.supplierCompanyId === companyId || f.isPublished),
            )
            .reverse()
        : []
    rows.push({ family, status, candidates })
  }

  // Whether each candidate is in the company's library and reaches it: one query each for all of them.
  const candidateIds = [...new Set(rows.flatMap((row) => row.candidates.map((c) => c.id)))]
  const hidden = await listFamiliesHiddenFromLibrary(tx, companyId, candidateIds)
  const shared = await listFamiliesSharedWith(
    tx,
    candidateIds.filter((id) => rows.some((row) => row.candidates.some((c) => c.id === id && c.supplierCompanyId !== companyId))),
    companyId,
  )
  return rows.map(({ family, status, candidates }) => {
    const usable = candidates.find((c) => !hidden.has(c.id) && (c.supplierCompanyId === companyId || shared.has(c.id)))
    return {
      productFamilyId: family.id,
      name: family.name,
      version: family.version,
      status,
      priceValidTo: family.priceValidTo,
      replacement: usable ? { id: usable.id, version: usable.version, name: usable.name } : null,
    }
  })
}

/**
 * The alternative to open when the caller didn't name one: the lowest that exists on that
 * version. A new version copies only one cell, so alternative 1 of the latest version may be empty.
 */
const alternativeOnVersion = async (
  tx: DbLike,
  quoteId: string,
  versionNumber: number,
  alternativeNumber: number | undefined,
): Promise<number> => {
  if (alternativeNumber !== undefined) return alternativeNumber
  const alternatives = (await listQuoteVersionRows(tx, quoteId))
    .filter((row) => row.version === versionNumber)
    .map((row) => row.alternative)
  return alternatives.length > 0 ? Math.min(...alternatives) : 1
}

const loadDetail = async (
  tx: DbLike,
  companyId: string,
  quote: QuoteRow,
  versionNumber: number,
  alternativeNumber = 1,
): Promise<SalesQuoteDetailResponse | null> => {
  const version = await getQuoteVersion(tx, quote.id, versionNumber, alternativeNumber)
  if (!version) return null
  const dto = toVersion(version)
  const variants = await listQuoteVersions(tx, quote.id)
  return {
    quote: toSummary(quote, variants),
    versions: variants.map(toVariantRef),
    version: dto,
    familyStatus: await familyStatuses(tx, companyId, dto.document),
  }
}

export const listMyQuotes = (ctx: TenantContext, filter: ListQuotesFilter & { favorites?: boolean } = {}): Promise<QuoteSummary[]> =>
  withTenantDb(ctx, async (tx) => {
    const rows = await listQuotes(tx, ctx.effectiveCompanyId, filter)
    const variants = await listQuoteVariantsForQuotes(tx, rows.map((row) => row.id))
    const byQuote = new Map<string, QuoteVariantListRow[]>()
    for (const variant of variants) {
      const list = byQuote.get(variant.quoteId) ?? []
      list.push(variant)
      byQuote.set(variant.quoteId, list)
    }
    const summaries = rows.map((row) => toSummary(row, byQuote.get(row.id) ?? []))
    return filter.favorites ? summaries.filter((quote) => quote.variants.some((variant) => variant.isFavorite)) : summaries
  })

/**
 * A quote with one variant. With no alternative, that is the lowest one on the requested version
 * (the latest version when none is named). Null when the quote or that variant doesn't exist or
 * isn't visible. An archived quote still loads, so a direct link works.
 */
export const getQuote = (
  ctx: TenantContext,
  quoteId: string,
  versionNumber?: number,
  alternativeNumber?: number,
): Promise<SalesQuoteDetailResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) return null
    const version = versionNumber ?? quote.latestVersion
    return loadDetail(tx, ctx.effectiveCompanyId, quote, version, await alternativeOnVersion(tx, quote.id, version, alternativeNumber))
  })

// ── Creating ──────────────────────────────────────────────────────────────────

/** The payment plan and activities a new quote starts from (the client's defaults; all editable). */
const DEFAULT_PAYMENTS: [string, number][] = [
  ['Acconto alla firma del contratto', 30],
  ['Stato avanzamento lavori (SAL)', 40],
  ['Saldo a completamento lavori', 30],
]
const DEFAULT_ACTIVITIES: [string, boolean][] = [
  ['Fornitura materiali', true],
  ['Posa in opera', true],
  ['Rimozione infissi esistenti', true],
  ['Opere murarie di contorno', true],
  ['Trasporto e logistica', true],
  ['Collaudo e verifica finale', true],
  ['Pulizia del cantiere', true],
  ['Progettazione esecutiva', false],
  ['Assistenza post-vendita', false],
  ['Documentazione tecnica', false],
]

/** The blocks a new quote's closing starts with, in the client's order. */
/** Replit's opening letter, signed generically (the sales contact and branch already head the print). */
const DEFAULT_INTRO_HTML = [
  '<p>Gentile Cliente,</p><p></p>',
  "<p>come anticipato, abbiamo il piacere di sottoporLe la nostra proposta per la fornitura dei serramenti relativi all'immobile indicato, elaborata a seguito di un'attenta analisi delle Sue esigenze e delle caratteristiche specifiche dell'abitazione.</p><p></p>",
  '<p>Il nostro intervento prevede una gestione diretta e completa di ogni fase del lavoro, dalla fornitura alla posa in opera, svolta nel pieno rispetto delle normative vigenti e secondo elevati standard qualitativi.</p><p></p>',
  '<p>Al termine dell\'installazione Le verrà consegnata tutta la documentazione tecnica necessaria, pensata per accompagnarLa nel tempo nella corretta gestione e manutenzione dei serramenti.</p><p></p>',
  '<p>Restiamo a Sua completa disposizione per qualsiasi chiarimento o approfondimento e saremo lieti di affiancarLa con attenzione e professionalità nelle successive fasi del progetto.</p><p></p>',
  '<p>Cordiali saluti</p>',
].join('')

const DEFAULT_CLOSING_PRE_HTML = "<p>Validità dell'offerta: 30 giorni dalla data di emissione</p>"

/** Replit's closing conditions; the payment split lives in the payment plan block, so it is not repeated here. */
const DEFAULT_CLOSING_POST_HTML = [
  '<p>IVA: Da definire</p><p></p>',
  '<p>Eventuali forniture parziali/anticipate dovranno essere saldate ad avviso merce pronta o alla consegna (SAL), a seconda della tipologia di prodotti.</p><p></p>',
  '<p>Detrazioni fiscali Ecobonus o Casa Bonus a seconda del tipo di intervento edilizio e regime fiscale.</p><p></p>',
  "<p>Qualora il contratto non si perfezioni, per circostanze riferibili al Cliente e/o ai soggetti terzi da questi incaricati (imprese, professionisti, etc.), l'acconto versato verrà trattenuto dal Fornitore a titolo di penale e a copertura delle spese sostenute per le attività di pianificazione, organizzazione, studio e verifica tecnica.</p><p></p>",
  '<p>Firma del Cliente per accettazione</p><p></p>',
  '<p>Luogo e Data _________________</p><p>Nome e Cognome _________________</p><p>Firma _________________</p><p></p>',
  "<p>Il Cliente conferma di accettare espressamente la trattenuta dell'acconto da parte del Fornitore, in caso di mancato perfezionamento del contratto di fornitura.</p><p></p>",
  '<p>Firma _________________</p><p></p>',
  '<p>Costituiscono parte integrante della presente offerta i seguenti documenti:</p>',
  '<ul><li><p>Informativa relativa al trattamento dei dati personali;</p></li><li><p>Condizioni generali di fornitura;</p></li><li><p>Dichiarazione di responsabilità per applicazione IVA agevolata (se pertinente);</p></li></ul>',
].join('')

const defaultClosing = (): ClosingBlock[] => [
  { id: 'c-text-1', type: 'text', html: DEFAULT_CLOSING_PRE_HTML },
  { id: 'c-families', type: 'familySummary' },
  { id: 'c-categories', type: 'categorySummary' },
  { id: 'c-total', type: 'total' },
  {
    id: 'c-payments',
    type: 'payments',
    rows: DEFAULT_PAYMENTS.map(([description, pct], index) => ({ id: `pag-${index + 1}`, description, pct })),
  },
  {
    id: 'c-activities',
    type: 'activities',
    rows: DEFAULT_ACTIVITIES.map(([description, included], index) => ({ id: `att-${index + 1}`, description, included, enabled: true })),
  },
  { id: 'c-text-2', type: 'text', html: DEFAULT_CLOSING_POST_HTML },
]

/** Creates a draft quote whose first version has no families yet but Replit's default texts, payments and activities, the caller as its sales contact and their branch (their first) heading it. */
export const createQuote = async (
  ctx: TenantContext,
  actor: QuoteActor,
  input: CreateSalesQuoteRequest,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const units = await listBusinessUnitsWithUsers(tx, ctx.effectiveCompanyId, { withLogos: false })
    const document: QuoteDocument = {
      header: {
        customerName: input.header.customerName,
        customerFiscalCode: input.header.customerFiscalCode,
        customerAddress: input.header.customerAddress,
        customerCity: input.header.customerCity,
        projectLocation: input.header.projectLocation,
        quoteDate: input.header.quoteDate ?? priceValidityToday(),
        notes: input.header.notes ?? '',
      },
      intro: [{ id: 'm-1', html: DEFAULT_INTRO_HTML }],
      families: [],
      closing: defaultClosing(),
      printSettings: {
        ...defaultQuotePrintSettings,
        salesContactUserId: actor.actorUserId,
        businessUnitId: (units.find((unit) => unit.userIds.includes(actor.actorUserId)) ?? units[0])?.id ?? null,
      },
    }
    // Insert from an explicit allowlist — never spread the request body (see the route).
    const quoteId = await insertQuote(tx, {
      supplierCompanyId: ctx.effectiveCompanyId,
      createdByUserId: actor.actorUserId,
      reference: input.reference,
      customerName: document.header.customerName,
      projectLocation: document.header.projectLocation,
      totalPrice: '0.00',
    })
    const version = await insertQuoteVersion(tx, {
      quoteId,
      version: 1,
      status: 'draft',
      document,
      totalPrice: '0.00',
      createdByUserId: actor.actorUserId,
    })
    await insertQuoteRevision(tx, {
      quoteVersionId: version.id,
      revision: 1,
      document,
      totalPrice: '0.00',
      changes: [],
      fromVersion: null,
      savedByUserId: actor.actorUserId,
    })
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.create',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { reference: input.reference },
    })
    const quote = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, quote!, 1))!
  })

// ── Saving ────────────────────────────────────────────────────────────────────

/**
 * The document as it will be stored: rich text sanitized, and every catalog line checked
 * against its family and (unless its price was typed in) repriced from the catalog, with the
 * option names as the catalog has them. Families the version didn't have before must also be
 * in the company's library and ready for invoicing.
 * @throws {QuoteValidationError} an unusable family, a line or option not in its family, or a line the engine can't price
 */
const prepareDocument = async (
  tx: DbLike,
  companyId: string,
  document: QuoteDocument,
  previous: QuoteDocument,
): Promise<QuoteDocument> => {
  const knownFamilyIds = new Set(catalogFamilyIds(previous))
  const families: QuoteDocument['families'] = []
  for (const family of document.families) {
    if (!family.productFamilyId) {
      if (family.lines.some((line) => line.productLineId !== null || line.priceMode !== 'manual')) {
        throw new QuoteValidationError(`"${family.name}" is not from the catalog, so its lines need their own price`)
      }
      families.push(family)
      continue
    }
    const detail = await loadPricingFamily(tx, companyId, family.productFamilyId)
    await assertFamilyUsable(tx, companyId, detail.family, { isNew: !knownFamilyIds.has(family.productFamilyId) })
    const lines: QuoteDocument['families'][number]['lines'] = []
    for (const line of family.lines) {
      if (!line.productLineId) {
        if (line.priceMode !== 'manual') {
          throw new QuoteValidationError(`"${line.name}" is not from the catalog, so it needs its own price`)
        }
        lines.push(line)
        continue
      }
      if (line.priceMode === 'manual') {
        if (!detail.lines.some((l) => l.id === line.productLineId)) {
          throw new QuoteValidationError(`"${line.name}" is not a line of "${detail.family.name}"`)
        }
        lines.push(line)
        continue
      }
      const priced = await priceCatalogLine(tx, companyId, detail, { ...line, productLineId: line.productLineId })
      lines.push({ ...line, unitPrice: priced.unitPrice, options: priced.options })
    }
    families.push({ ...family, lines })
  }
  return {
    ...document,
    intro: document.intro.map((module) => ({ ...module, html: sanitizeRichText(module.html) })),
    families,
    closing: document.closing.map((block) => (block.type === 'text' ? { ...block, html: sanitizeRichText(block.html) } : block)),
  }
}

/**
 * The quotes list follows the lowest alternative that exists on the highest version, so a
 * version that only promoted V2A2 still has a row to show.
 */
const syncQuoteMirror = async (tx: DbLike, quoteId: string): Promise<void> => {
  const rows = await listQuoteVersionRows(tx, quoteId)
  if (rows.length === 0) return
  const latestVersion = Math.max(...rows.map((row) => row.version))
  const head = rows
    .filter((row) => row.version === latestVersion)
    .sort((a, b) => a.alternative - b.alternative)[0]
  if (!head) return
  const document = quoteDocumentSchema.parse(head.document)
  await updateQuoteSummary(tx, quoteId, {
    status: head.status,
    customerName: document.header.customerName,
    projectLocation: document.header.projectLocation,
    totalPrice: head.totalPrice,
    latestVersion,
  })
}

/**
 * Copies one variant to the next version, same alternative (V1A2 → V2A2). The other alternatives
 * are not created. Refuses when that cell already exists.
 */
const insertPromotedVariant = async (
  tx: DbLike,
  actor: QuoteActor,
  quoteId: string,
  source: QuoteVersionRow,
  document: QuoteDocument,
  totalPrice: string,
  changes: QuoteChange[],
): Promise<number> => {
  const targetVersion = source.version + 1
  const taken = (await listQuoteVersionRows(tx, quoteId)).some(
    (row) => row.version === targetVersion && row.alternative === source.alternative,
  )
  if (taken) {
    throw new QuoteValidationError(`V${targetVersion}A${source.alternative} already exists`)
  }
  const created = await insertQuoteVersion(tx, {
    quoteId,
    version: targetVersion,
    alternative: source.alternative,
    label: source.label,
    status: 'draft',
    document,
    totalPrice,
    createdByUserId: actor.actorUserId,
  })
  await insertQuoteRevision(tx, {
    quoteVersionId: created.id,
    revision: 1,
    document,
    totalPrice,
    changes,
    fromVersion: source.version,
    fromAlternative: source.alternative,
    savedByUserId: actor.actorUserId,
  })
  await syncQuoteMirror(tx, quoteId)
  return targetVersion
}

/**
 * Saves the builder's document. `update` fixes this variant in place (drafts only). `newVersion`
 * copies only this alternative to the next version (V1A2 → V2A2) and leaves every other cell empty.
 * @throws {QuoteValidationError} no such version, a non-draft fixed in place, the next cell already exists, or an invalid document
 * @throws {QuoteConflictError} someone saved the version after `baseRevision`
 */
export const saveQuoteVersion = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  versionId: string,
  input: SaveQuoteRequest,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await lockQuote(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) throw new QuoteValidationError('Version not found')
    if (version.revision !== input.baseRevision) {
      throw new QuoteConflictError('This version was saved by someone else in the meantime: reload it to see their changes')
    }
    if (input.mode === 'update' && !isEditableQuoteStatus(version.status)) {
      throw new QuoteValidationError(`Version ${version.version} was ${version.status}: save your changes as a new version`)
    }
    const previous = quoteDocumentSchema.parse(version.document)
    const document = await prepareDocument(tx, ctx.effectiveCompanyId, input.document, previous)
    const totalPrice = quoteTotal(document).toFixed(2)
    const changes: QuoteChange[] = diffQuoteDocuments(previous, document)

    let savedVersion: number
    if (input.mode === 'update') {
      const saved = await updateQuoteVersionDocument(tx, version.id, input.baseRevision, {
        document,
        totalPrice,
        updatedByUserId: actor.actorUserId,
      })
      if (!saved) throw new QuoteConflictError('This version was saved by someone else in the meantime: reload it to see their changes')
      await insertQuoteRevision(tx, {
        quoteVersionId: version.id,
        revision: input.baseRevision + 1,
        document,
        totalPrice,
        changes,
        fromVersion: null,
        fromAlternative: null,
        savedByUserId: actor.actorUserId,
      })
      savedVersion = version.version
      await syncQuoteMirror(tx, quoteId)
    } else {
      // Only this alternative moves forward: V1A2 becomes V2A2. The other columns stay empty.
      savedVersion = await insertPromotedVariant(tx, actor, quoteId, version, document, totalPrice, changes)
    }

    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: input.mode === 'update' ? 'quote.save' : 'quote.new_version',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: {
        version: savedVersion,
        alternative: version.alternative,
        fromVersion: input.mode === 'update' ? undefined : version.version,
        changes: changes.length,
      },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, savedVersion, version.alternative))!
  })

const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'invoiced', 'accepted']

/**
 * Sets a variant to draft, invoiced or accepted. Leaving draft (invoicing or accepting) requires
 * every catalog family to have prices valid today. Only a draft can be edited in place.
 * @throws {QuoteValidationError} no such version, the same status again, or a family that can't price today
 */
export const setQuoteVersionStatusById = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  versionId: string,
  status: QuoteStatus,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await lockQuote(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) throw new QuoteValidationError('Version not found')
    if (!QUOTE_STATUSES.includes(status)) {
      throw new QuoteValidationError('Status must be draft, invoiced, or accepted')
    }
    if (status === version.status) {
      throw new QuoteValidationError(`This version is already ${status}`)
    }
    const document = quoteDocumentSchema.parse(version.document)
    // Leaving a draft (to invoiced or accepted) still needs catalog families that can price today.
    // A quote already invoiced can be accepted later, even after those prices expire.
    if (version.status === 'draft' && (status === 'invoiced' || status === 'accepted')) {
      const blocked = (await familyStatuses(tx, ctx.effectiveCompanyId, document)).find((family) => family.status !== 'current')
      if (blocked) {
        throw new QuoteValidationError(
          blocked.status === 'expired'
            ? `The prices of "${blocked.name}" expired on ${blocked.priceValidTo}: switch to a newer version of it, or upload one`
            : blocked.status === 'upcoming'
              ? `The prices of "${blocked.name}" are not valid yet`
              : `"${blocked.name}" is no longer published: switch to a newer version of it, or upload one`,
        )
      }
    }
    await setQuoteVersionStatus(tx, version.id, {
      status,
      sentAt: status === 'invoiced' ? new Date() : version.sentAt,
      updatedByUserId: actor.actorUserId,
    })
    await syncQuoteMirror(tx, quoteId)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.set_status',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: version.version, alternative: version.alternative, from: version.status, to: status },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, version.version, version.alternative))!
  })

const assertMayArchive = async (tx: DbLike, actor: QuoteActor): Promise<void> => {
  if (!(await userMayArchive(tx, actor.actorUserId))) {
    throw new QuoteForbiddenError('Only a company admin can archive a quote')
  }
}

/** Soft-deletes or restores a quote. The versions stay; the list hides it until archived is included. */
export const setQuoteArchived = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  archived: boolean,
): Promise<{ archivedAt: string | null }> =>
  withTenantDb(ctx, async (tx) => {
    await assertMayArchive(tx, actor)
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const archivedAt = archived ? new Date() : null
    await setQuoteArchivedAt(tx, quoteId, archivedAt)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: archived ? 'quote.archive' : 'quote.restore',
      resourceType: 'quote',
      resourceId: quoteId,
    })
    return { archivedAt: archivedAt?.toISOString() ?? null }
  })

/**
 * Copies the document open in the editor as the next alternative of the same version (V1A2, V1A3, …).
 * A new draft with no label. The source variant is left as it was.
 */
export const createQuoteAlternative = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  versionId: string,
  input: CreateQuoteAlternativeRequest,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await lockQuote(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) throw new QuoteValidationError('Version not found')
    const previous = quoteDocumentSchema.parse(version.document)
    const document = await prepareDocument(tx, ctx.effectiveCompanyId, input.document, previous)
    const totalPrice = quoteTotal(document).toFixed(2)
    const used = new Set(
      (await listQuoteVersionRows(tx, quoteId)).filter((row) => row.version === version.version).map((row) => row.alternative),
    )
    let alternative = version.alternative + 1
    while (used.has(alternative)) alternative += 1
    const created = await insertQuoteVersion(tx, {
      quoteId,
      version: version.version,
      alternative,
      label: null,
      status: 'draft',
      document,
      totalPrice,
      createdByUserId: actor.actorUserId,
    })
    await insertQuoteRevision(tx, {
      quoteVersionId: created.id,
      revision: 1,
      document,
      totalPrice,
      changes: diffQuoteDocuments(previous, document),
      fromVersion: version.version,
      fromAlternative: version.alternative,
      savedByUserId: actor.actorUserId,
    })
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.new_alternative',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: version.version, alternative, fromAlternative: version.alternative },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, version.version, alternative))!
  })

/**
 * Copies a saved variant into the next version, same alternative. Used by the matrix: hovering
 * a cell creates the one below it, and hovering an empty cell copies the one above into it.
 * The stored document is copied; unsaved editor changes are not.
 */
export const promoteQuoteVariant = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  versionId: string,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await lockQuote(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) throw new QuoteValidationError('Version not found')
    const document = quoteDocumentSchema.parse(version.document)
    const targetVersion = await insertPromotedVariant(tx, actor, quoteId, version, document, version.totalPrice, [])
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.new_version',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: targetVersion, alternative: version.alternative, fromVersion: version.version },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, targetVersion, version.alternative))!
  })

/** Marks or clears a favorite on this variant. The final offer, and the other variants, stay as they are. */
export const setQuoteVariantFavorite = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  versionId: string,
  favorite: boolean,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) throw new QuoteValidationError('Version not found')
    await setQuoteVersionFavorite(tx, version.id, favorite)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: favorite ? 'quote.favorite' : 'quote.unfavorite',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: version.version, alternative: version.alternative },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, version.version, version.alternative))!
  })

/** Marks this variant as the one the dashboard shows. Any previous final on the quote is cleared. */
export const setQuoteVariantFinal = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  versionId: string,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) throw new QuoteValidationError('Version not found')
    await setQuoteVersionFinal(tx, quoteId, version.id)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.final',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: version.version, alternative: version.alternative },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, version.version, version.alternative))!
  })

/** Sets the name shown next to the variant code. Does not change the document. */
export const setQuoteVariantLabelById = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  versionId: string,
  input: SetQuoteVariantLabelRequest,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) throw new QuoteValidationError('Quote not found')
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) throw new QuoteValidationError('Version not found')
    await setQuoteVersionLabel(tx, version.id, input.label)
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.label',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: version.version, alternative: version.alternative, label: input.label },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, version.version, version.alternative))!
  })

/**
 * A new quote whose only variant is V1A1, copied from one specific variant. The new reference is
 * the caller's; the label travels with the copy.
 */
export const duplicateQuoteVariant = async (
  ctx: TenantContext,
  actor: QuoteActor,
  quoteId: string,
  input: DuplicateSalesQuoteRequest,
): Promise<SalesQuoteDetailResponse> =>
  withTenantDb(ctx, async (tx) => {
    const sourceQuote = await getQuoteRow(tx, quoteId)
    if (!sourceQuote) throw new QuoteValidationError('Quote not found')
    const source = await getQuoteVersionById(tx, quoteId, input.versionId)
    if (!source) throw new QuoteValidationError('Version not found')
    const document = quoteDocumentSchema.parse(source.document)
    const totalPrice = source.totalPrice
    const newQuoteId = await insertQuote(tx, {
      supplierCompanyId: ctx.effectiveCompanyId,
      createdByUserId: actor.actorUserId,
      reference: input.reference,
      customerName: document.header.customerName,
      projectLocation: document.header.projectLocation,
      totalPrice,
    })
    const created = await insertQuoteVersion(tx, {
      quoteId: newQuoteId,
      version: 1,
      alternative: 1,
      label: source.label,
      status: 'draft',
      document,
      totalPrice,
      createdByUserId: actor.actorUserId,
    })
    await insertQuoteRevision(tx, {
      quoteVersionId: created.id,
      revision: 1,
      document,
      totalPrice,
      changes: [],
      fromVersion: null,
      fromAlternative: null,
      savedByUserId: actor.actorUserId,
    })
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.duplicate',
      resourceType: 'quote',
      resourceId: newQuoteId,
      metadata: {
        reference: input.reference,
        fromQuoteId: quoteId,
        fromVersion: source.version,
        fromAlternative: source.alternative,
      },
    })
    const quote = await getQuoteRow(tx, newQuoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, quote!, 1, 1))!
  })

// ── History ───────────────────────────────────────────────────────────────────

/** Every save of a version, newest first; null when the quote or version doesn't exist or isn't visible. */
export const getQuoteRevisions = (ctx: TenantContext, quoteId: string, versionId: string): Promise<QuoteRevision[] | null> =>
  withTenantDb(ctx, async (tx) => {
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) return null
    return (await listQuoteRevisions(tx, version.id)).map((row) => ({
      revision: row.revision,
      savedAt: row.savedAt.toISOString(),
      savedBy: row.savedByUserId ? { id: row.savedByUserId, name: row.savedByName } : null,
      totalPrice: row.totalPrice,
      changes: row.changes as QuoteChange[],
      fromVersion: row.fromVersion,
      fromAlternative: row.fromAlternative,
    }))
  })

/** One past save of a version, with its document; null when there is none. */
export const getQuoteRevisionDetail = (
  ctx: TenantContext,
  quoteId: string,
  versionId: string,
  revision: number,
): Promise<QuoteRevisionDetail | null> =>
  withTenantDb(ctx, async (tx) => {
    const version = await getQuoteVersionById(tx, quoteId, versionId)
    if (!version) return null
    const row = await getQuoteRevision(tx, version.id, revision)
    if (!row) return null
    return {
      revision: row.revision,
      savedAt: row.savedAt.toISOString(),
      savedBy: row.savedByUserId ? { id: row.savedByUserId, name: row.savedByName } : null,
      totalPrice: row.totalPrice,
      changes: row.changes as QuoteChange[],
      fromVersion: row.fromVersion,
      fromAlternative: row.fromAlternative,
      document: quoteDocumentSchema.parse(row.document),
    }
  })

/**
 * A quote's audit entries (created, saved, new versions, status changes), newest first — for
 * anyone who can see the quote. Returns null when the quote doesn't exist or isn't visible.
 * @throws {InvalidAuditCursorError} `query.cursor` was not produced by this API
 */
export const getQuoteHistory = (
  ctx: TenantContext,
  quoteId: string,
  query: RecordHistoryQuery,
): Promise<AuditLogListResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    if (!(await quoteExists(tx, quoteId))) {
      return null
    }
    return listAuditPage(tx, { resourceType: 'quote', resourceId: quoteId }, query.cursor, query.limit, toHistoryEntry)
  })

// ── Printing ──────────────────────────────────────────────────────────────────


/** Everything the printed quote shows: the version, the company's fiscal data, the branch and the sales contact. */
export const getQuotePrintData = (
  ctx: TenantContext,
  quoteId: string,
  versionNumber?: number,
  alternativeNumber?: number,
): Promise<QuotePrintData | null> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) return null
    const openedVersion = versionNumber ?? quote.latestVersion
    const row = await getQuoteVersion(tx, quoteId, openedVersion, await alternativeOnVersion(tx, quoteId, openedVersion, alternativeNumber))
    if (!row) return null
    const version = toVersion(row)
    const profile = await getCompanyProfile(tx, quote.supplierCompanyId)
    const units = await listBusinessUnitsWithUsers(tx, quote.supplierCompanyId, { withLogos: false })
    const contacts = await listSalesContacts(tx, quote.supplierCompanyId)
    const settings = version.document.printSettings
    const unit = units.find((u) => u.id === settings.businessUnitId) ?? units[0] ?? null
    // Only the logo of the branch heading the pages.
    const logoDataUrl = unit ? await getBusinessUnitLogo(tx, quote.supplierCompanyId, unit.id) : null
    return {
      quote: toSummary(quote, await listQuoteVersions(tx, quote.id)),
      version,
      company: {
        name: profile?.name ?? '',
        vatNumber: profile?.vatNumber ?? '',
        fiscalAddress: profile?.fiscalAddress ?? null,
        fiscalCode: profile?.fiscalCode ?? null,
        sdiCode: profile?.sdiCode ?? null,
        email: profile?.email ?? null,
        pecEmail: profile?.pecEmail ?? null,
        phone: profile?.phone ?? null,
      },
      businessUnit: unit
        ? {
            id: unit.id,
            name: unit.name,
            address: unit.address,
            email: unit.email,
            phone: unit.phone,
            primaryColor: unit.primaryColor,
            logoDataUrl,
            userIds: unit.userIds,
          }
        : null,
      salesContact: contacts.find((contact) => contact.id === settings.salesContactUserId) ?? null,
    }
  })
