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
  listQuoteVersions,
  listQuotes,
  listSalesContacts,
  lockQuote,
  quoteExists,
  setQuoteVersionStatus,
  updateQuoteSummary,
  updateQuoteVersionDocument,
  type DbLike,
  type QuoteRow,
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
  type CreateSalesQuoteRequest,
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
  type SalesQuoteDetailResponse,
  type SaveQuoteRequest,
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

const toSummary = (quote: QuoteRow): QuoteSummary => ({
  id: quote.id,
  reference: quote.reference,
  status: quote.status,
  customerName: quote.customerName,
  projectLocation: quote.projectLocation,
  totalPrice: quote.totalPrice,
  latestVersion: quote.latestVersion,
  createdAt: quote.createdAt.toISOString(),
  updatedAt: quote.updatedAt.toISOString(),
})

const toVersion = (row: QuoteVersionWithUsers): QuoteVersion => ({
  id: row.id,
  quoteId: row.quoteId,
  version: row.version,
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

const loadDetail = async (
  tx: DbLike,
  companyId: string,
  quote: QuoteRow,
  versionNumber: number,
): Promise<SalesQuoteDetailResponse | null> => {
  const version = await getQuoteVersion(tx, quote.id, versionNumber)
  if (!version) return null
  const dto = toVersion(version)
  return {
    quote: toSummary(quote),
    versions: (await listQuoteVersions(tx, quote.id)).map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      totalPrice: v.totalPrice,
      updatedAt: v.updatedAt.toISOString(),
    })),
    version: dto,
    familyStatus: await familyStatuses(tx, companyId, dto.document),
  }
}

export const listMyQuotes = (ctx: TenantContext): Promise<QuoteSummary[]> =>
  withTenantDb(ctx, async (tx) => (await listQuotes(tx, ctx.effectiveCompanyId)).map(toSummary))

/** A quote with one of its versions (the latest by default); null when the quote or the version doesn't exist or isn't visible. */
export const getQuote = (ctx: TenantContext, quoteId: string, versionNumber?: number): Promise<SalesQuoteDetailResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) return null
    return loadDetail(tx, ctx.effectiveCompanyId, quote, versionNumber ?? quote.latestVersion)
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

const mirrorLatest = (tx: DbLike, quoteId: string, latestVersion: number, status: QuoteStatus, document: QuoteDocument, totalPrice: string) =>
  updateQuoteSummary(tx, quoteId, {
    status,
    customerName: document.header.customerName,
    projectLocation: document.header.projectLocation,
    totalPrice,
    latestVersion,
  })

/**
 * Saves the builder's document. `update` fixes the version in place as its next revision (a
 * draft only); `newVersion` stores it as the quote's next version, a draft, and leaves this one
 * as it was. Either way the full document and what changed are kept in the history.
 * @throws {QuoteValidationError} no such version, a non-draft fixed in place, or an invalid document
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
        savedByUserId: actor.actorUserId,
      })
      savedVersion = version.version
      if (version.version === quote.latestVersion) {
        await mirrorLatest(tx, quoteId, quote.latestVersion, version.status, document, totalPrice)
      }
    } else {
      savedVersion = quote.latestVersion + 1
      const created = await insertQuoteVersion(tx, {
        quoteId,
        version: savedVersion,
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
        fromVersion: version.version,
        savedByUserId: actor.actorUserId,
      })
      await mirrorLatest(tx, quoteId, savedVersion, 'draft', document, totalPrice)
    }

    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: input.mode === 'update' ? 'quote.save' : 'quote.new_version',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: savedVersion, fromVersion: input.mode === 'update' ? undefined : version.version, changes: changes.length },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, savedVersion))!
  })

/** Allowed status changes: a draft is sent; a sent version is accepted or rejected (or sent again after being reopened is not possible — make a new version). */
const NEXT_STATUSES: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'rejected'],
  accepted: ['rejected'],
  rejected: ['accepted'],
}

/**
 * Marks a version sent, accepted or rejected. A draft can only be sent while all of its catalog
 * families have prices valid today and are published (an expired one must be replaced first).
 * @throws {QuoteValidationError} no such version, a change that isn't allowed, or a family that can't price today
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
    if (!NEXT_STATUSES[version.status].includes(status)) {
      throw new QuoteValidationError(`A ${version.status} version can't be marked ${status}`)
    }
    const document = quoteDocumentSchema.parse(version.document)
    if (status === 'sent') {
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
      sentAt: status === 'sent' ? new Date() : version.sentAt,
      updatedByUserId: actor.actorUserId,
    })
    if (version.version === quote.latestVersion) {
      await mirrorLatest(tx, quoteId, quote.latestVersion, status, document, version.totalPrice)
    }
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'quote.set_status',
      resourceType: 'quote',
      resourceId: quoteId,
      metadata: { version: version.version, from: version.status, to: status },
    })
    const fresh = await getQuoteRow(tx, quoteId)
    return (await loadDetail(tx, ctx.effectiveCompanyId, fresh!, version.version))!
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
export const getQuotePrintData = (ctx: TenantContext, quoteId: string, versionNumber?: number): Promise<QuotePrintData | null> =>
  withTenantDb(ctx, async (tx) => {
    const quote = await getQuoteRow(tx, quoteId)
    if (!quote) return null
    const row = await getQuoteVersion(tx, quoteId, versionNumber ?? quote.latestVersion)
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
      quote: toSummary(quote),
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
