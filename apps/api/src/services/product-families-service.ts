import { unlink } from 'node:fs/promises'
import { extname } from 'node:path'

import {
  characteristicNameTaken,
  countProductFamilyImagesAtPath,
  deleteCharacteristic as deleteCharacteristicQuery,
  deletePricingMatrixIfUnused,
  deleteProductFamily as deleteProductFamilyQuery,
  deleteProductFamilyImage as deleteProductFamilyImageQuery,
  deleteProductLine as deleteProductLineQuery,
  getCharacteristicInFamily,
  getProductFamilyById,
  getProductFamilyImageInFamily,
  getProductLineInFamily,
  linkCharacteristicToAllLines,
  listCharacteristicWithOptions,
  listMainCharacteristicIds,
  nextCharacteristicSortOrder,
  nextProductFamilyImageSortOrder,
  nextProductLineSortOrder,
  productLineNameTaken,
  replaceProductLineCharacteristics,
  touchProductFamily,
  updateProductFamilyDetails as updateProductFamilyDetailsQuery,
  updateProductFamilyImageTitle,
  listStoredFamilyChanges,
  listFamilyChangesInvolving,
  listFamilyPredecessors,
  saveFamilyChanges,
  type StoredFamilyChanges,
  updateCharacteristic as updateCharacteristicQuery,
  updatePricingMatrix as updatePricingMatrixQuery,
  updateProductLine as updateProductLineQuery,
  findLatestProductFamilyVersion,
  getProductFamilyDetail as getProductFamilyDetailQuery,
  insertCharacteristic,
  insertPricingMatrix,
  insertProductFamily,
  insertProductFamilyImage,
  insertProductLine,
  insertProductLineCharacteristic,
  listProductFamilyCopies,
  listProductFamilyVersions,
  lockProductFamilyVersions,
  listProductFamilyVersionsOfChains,
  listProductLineNames,
  listVisibleProductFamilies,
  isFamilySharedWith,
  isProductFamilyInLibrary,
  setProductFamilyArchivedAt,
  setProductFamilyFavorite as setProductFamilyFavoriteQuery,
  setProductFamilyHasPriceList,
  setProductFamilyInLibrary,
  setProductFamilyPriceValidity,
  setProductFamilyPublished,
  setProductFamilyReadyForInvoicing,
  userMayArchive,
  type CharacteristicRow,
  type PricingMatrixRow,
  type ProductFamilyDetail,
  type ProductFamilyImageRow,
  type ProductFamilyListItem,
  type ProductFamilySummary,
  type ProductLineRow,
  type UpdateCharacteristicInput,
  type UpdateProductLineInput,
} from '@schuco/db'
import {
  FAMILY_DIFF_VERSION,
  countFamilyChanges,
  diffFamilyVersions,
  findOverlappingValidity,
  type FamilyChangeNode,
  type AuditLogListResponse,
  type DuplicateProductFamilyRequest,
  type FamilyVersionComparison,
  type FamilyVersionSummary,
  type FamilyVersionsResponse,
  type PriceValidity,
  type PriceValidityOverlapResponse,
  type PriceValidityRequest,
  createProductFamilyRequestSchema,
  updateProductFamilyDetailsSchema,
  updateProductFamilyImageRequestSchema,
  type ProductFamilyImportPreview,
  type ProductFamilyImportWarning,
  type RecordHistoryQuery,
} from '@schuco/contracts'

import { isUuid } from '../lib/uuid'
import { extractEmbeddedImages } from '../lib/excel-import/extract-embedded-images'
import { parseProductFamilyWorkbook, type ParsedWorkbook } from '../lib/excel-import'
import { resolvePriceListType } from '../lib/excel-import/price-list-types'
import type { RawPricingMatrix } from '../lib/excel-import/types'
import {
  ProductFamilyLockedError,
  ProductFamilyNotFoundError,
  ProductFamilyValidationError,
  characteristicPatchHasPrice,
  isProductFamilyEditable,
  validateCharacteristicPatch,
  validateCreateCharacteristic,
  validateCreateProductLine,
  validateLinePatch,
  validateMatrixInput,
  type ValidatedCharacteristicPatch,
  type ValidatedLinePatch,
  type ValidatedPriceMode,
} from '../lib/product-family-edit'
import { saveLocalFile } from '../lib/local-storage'
import { withTenantDb, type TenantContext } from '../lib/tenant-db'
import { listAuditPage, recordAuditEvent, toHistoryEntry } from './audit-service'

export interface ProductFamilyActor {
  actorUserId: string
  actorCompanyId: string
  requestId?: string | null
}

/** The uploaded workbook doesn't have a recognized required sheet, an unrecognized Tipo_Listino, or another data problem — the import never touched the DB. */
export class ExcelImportError extends Error {}

/** The caller can see the family (it was shared with them) but its history belongs to the owning company. */
export class ProductFamilyHistoryForbiddenError extends Error {}

/** The caller can see the family but isn't allowed to archive it. */
export class ProductFamilyForbiddenError extends Error {}

/** Two versions of one family would sell at the same day's prices: a quote couldn't tell which applies. */
export class PriceValidityOverlapError extends Error {
  readonly overlap: PriceValidityOverlapResponse['overlap']

  constructor(other: PriceValidityOverlapResponse['overlap']) {
    super(`These dates overlap version ${other.version} (${other.priceValidFrom ?? '…'} – ${other.priceValidTo ?? '…'}): change its dates first`)
    this.overlap = { version: other.version, priceValidFrom: other.priceValidFrom, priceValidTo: other.priceValidTo }
  }
}

/**
 * Rejects `validity` when it shares a day with another version in `familyId`'s chain. Locks the
 * chain first, so a concurrent save of another version's dates waits for this transaction.
 * @throws {PriceValidityOverlapError} naming the first version it overlaps
 */
const assertNoValidityOverlap = async (
  tx: Parameters<typeof listProductFamilyVersions>[0],
  familyId: string,
  validity: PriceValidity,
  exceptId?: string,
): Promise<void> => {
  await lockProductFamilyVersions(tx, familyId)
  const versions = await listProductFamilyVersions(tx, familyId)
  const overlapping = findOverlappingValidity(validity, versions.filter((version) => version.id !== exceptId))
  if (overlapping) throw new PriceValidityOverlapError(overlapping)
}

const isMatrix = (value: number | RawPricingMatrix): value is RawPricingMatrix =>
  typeof value === 'object'

/**
 * Excel stores discount/markup as raw multipliers (`0.43` meaning 43%,
 * `1.5` meaning a 150% — i.e. 1.5x — multiplier), but the DB/costing
 * engine store and consume these "out of 100" (43, 150; see
 * `packages/calculation/src/product-costing.ts`'s `pct / 100`). A blank cell stays null: no
 * discount, no markup (100).
 * @param rawFraction - The sheet's raw decimal value, or null/undefined if the cell was blank
 */
const toStoredPct = (rawFraction: number | null | undefined): string | null =>
  rawFraction == null ? null : String(rawFraction * 100)

const auditActor = (actor: ProductFamilyActor) => ({
  actorType: 'user' as const,
  actorUserId: actor.actorUserId,
  actorCompanyId: actor.actorCompanyId,
  requestId: actor.requestId,
})

/**
 * Parses every sheet and checks every Tipo_Listino — everything that can
 * reject a workbook — without touching the disk or the DB.
 * @throws {ExcelImportError} the workbook is missing a required sheet, or uses an unrecognized Tipo_Listino
 */
const readWorkbook = (buffer: Buffer): ParsedWorkbook => {
  let parsed
  try {
    parsed = parseProductFamilyWorkbook(buffer)
  } catch (error) {
    throw new ExcelImportError((error as Error).message)
  }

  // Pre-resolve every price list type BEFORE touching the DB — an
  // unrecognized Tipo_Listino should fail the whole import cleanly, not
  // leave a half-imported family behind because it was found row 40 of 50.
  try {
    for (const line of parsed.productLines) {
      if (line.priceListType && !isMatrix(line.listinoAcquisto)) {
        resolvePriceListType(line.priceListType, parsed.templateVersion)
      }
    }
    for (const main of parsed.characteristics) {
      for (const sub of main.subCharacters) {
        if (sub.priceListType && !isMatrix(sub.listinoAcquisto)) {
          resolvePriceListType(sub.priceListType, parsed.templateVersion)
        }
      }
    }
  } catch (error) {
    throw new ExcelImportError((error as Error).message)
  }
  return parsed
}

/** Rows the import will skip or that look like a mistake in the workbook — shown before saving, never blocking. */
const workbookWarnings = (parsed: ParsedWorkbook): ProductFamilyImportWarning[] => {
  const warnings: ProductFamilyImportWarning[] = []
  const lineNames = new Set<string>()
  for (const line of parsed.productLines) {
    if (lineNames.has(line.name)) {
      warnings.push({ code: 'duplicateLineName', productLine: line.name })
    }
    lineNames.add(line.name)
  }
  const characteristicNames = new Set<string>()
  for (const main of parsed.characteristics) {
    if (characteristicNames.has(main.name)) {
      warnings.push({ code: 'duplicateCharacteristicName', characteristic: main.name })
    }
    characteristicNames.add(main.name)
  }
  for (const relation of parsed.relations) {
    const pair = { productLine: relation.productLineName, characteristic: relation.characteristicName }
    if (!lineNames.has(relation.productLineName)) {
      warnings.push({ code: 'relationUnknownLine', ...pair })
    } else if (!characteristicNames.has(relation.characteristicName)) {
      warnings.push({ code: 'relationUnknownCharacteristic', ...pair })
    }
  }
  return warnings
}

/**
 * What an uploaded workbook would import — the upload dialog shows it before
 * the user picks dates and saves. Parsed in memory; nothing is stored.
 * @throws {ExcelImportError} the workbook could not be imported as it is
 */
export const previewProductFamilyImport = async (file: {
  buffer: Buffer
  originalName: string
}): Promise<ProductFamilyImportPreview> => {
  const parsed = readWorkbook(file.buffer)
  const images = await extractEmbeddedImages(file.buffer, 'Product Family')
  const options = parsed.characteristics.flatMap((main) => main.subCharacters)
  const priceTables =
    parsed.productLines.filter((line) => isMatrix(line.listinoAcquisto)).length +
    options.filter((sub) => isMatrix(sub.listinoAcquisto)).length
  return {
    fileName: file.originalName,
    family: {
      name: parsed.family.family_name!,
      technicalName: parsed.family.technical_name ?? null,
      category: parsed.family.category ?? null,
      brand: parsed.family.brand ?? null,
    },
    counts: {
      productLines: parsed.productLines.length,
      characteristics: parsed.characteristics.length,
      options: options.length,
      priceTables,
      relations: parsed.relations.length,
      images: images.length,
    },
    warnings: workbookWarnings(parsed),
  }
}

/** What the user confirmed in the upload dialog, plus — for a re-import — where the new version sits in the chain. */
export interface ProductFamilyImportOptions {
  /** Replaces the workbook's family name when non-blank. */
  name?: string
  priceValidFrom?: string | null
  priceValidTo?: string | null
  /** Publish as part of the import instead of saving a draft. */
  publish?: boolean
  /** Offer the family for new quote positions right away. */
  readyForInvoicing?: boolean
  /** "Con listino"; a new family has one unless told otherwise. */
  hasPriceList?: boolean
  /** Makes this import a new *version* of an existing family (see `createNewVersionFromExcel`). */
  version?: { version: number; supersedesId: string; previous: ProductFamilyDetail }
}

/**
 * Imports a product family from an uploaded Excel workbook (ADR TBD):
 * parses every sheet, saves the file (and any embedded images) to local
 * disk, and inserts the family + product lines + characteristics +
 * pricing matrices + line/characteristic relations in one transaction.
 * The new family is a draft unless `options.publish` says otherwise.
 * @param ctx - Tenant context resolved by `requireAuth`
 * @param actor - Who's importing, for the audit record
 * @param supplierCompanyId - The company this family belongs to (always the caller's own — ADR 0001, no path/body override)
 * @param file - The uploaded workbook
 * @param options - Name override, price validity, publish, and `version` — which stores the given `version`/`supersedesId` and audits `product_family.new_version` instead of `product_family.import`.
 * @throws {ExcelImportError} the workbook is missing a required sheet, or uses an unrecognized Tipo_Listino
 * @throws {PriceValidityOverlapError} a new version's dates share a day with another version of the family
 */
export const importProductFamilyFromExcel = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  supplierCompanyId: string,
  file: { buffer: Buffer; originalName: string },
  options: ProductFamilyImportOptions = {},
): Promise<ProductFamilySummary> => {
  const parsed = readWorkbook(file.buffer)
  const versionOptions = options.version
  const priceValidity = { priceValidFrom: options.priceValidFrom ?? null, priceValidTo: options.priceValidTo ?? null }

  const extensionMatch = /\.[^.]+$/.exec(file.originalName)
  const excelPath = await saveLocalFile('product-family-excel', file.buffer, extensionMatch?.[0] ?? '.xlsx')
  const images = await extractEmbeddedImages(file.buffer, 'Product Family')
  const savedImages = await Promise.all(
    images.map(async (image, index) => ({
      localPath: await saveLocalFile('product-family-images', image.data, image.extension),
      sortOrder: index,
    })),
  )

  const family = await withTenantDb(ctx, async (tx) => {
    if (versionOptions) await assertNoValidityOverlap(tx, versionOptions.supersedesId, priceValidity)
    const familyId = await insertProductFamily(tx, {
      supplierCompanyId,
      name: options.name?.trim() || parsed.family.family_name!,
      technicalName: parsed.family.technical_name ?? null,
      category: parsed.family.category ?? null,
      brand: parsed.family.brand ?? null,
      description1: (parsed.family.description_1 as string | undefined) ?? null,
      description2: (parsed.family.description_2 as string | undefined) ?? null,
      note: parsed.family.note ?? null,
      distributor: parsed.family.distributor ?? null,
      sourceExcelPath: excelPath,
      version: versionOptions?.version,
      supersedesId: versionOptions?.supersedesId,
      ...priceValidity,
      isPublished: options.publish ?? false,
      readyForInvoicing: options.readyForInvoicing ?? false,
      hasPriceList: options.hasPriceList ?? true,
    })

    for (const image of savedImages) {
      await insertProductFamilyImage(tx, {
        productFamilyId: familyId,
        localPath: image.localPath,
        sortOrder: image.sortOrder,
      })
    }

    // Tracked so "Relations" rows (which reference names, not ids) and
    // matrix-typed lines/characteristics can resolve to what was just inserted.
    const lineIdByName = new Map<string, string>()

    for (const [index, line] of parsed.productLines.entries()) {
      let pricingMatrixId: string | null = null
      let value = '0'
      let formula = 'valore'

      if (isMatrix(line.listinoAcquisto)) {
        pricingMatrixId = await insertPricingMatrix(tx, {
          productFamilyId: familyId,
          widths: line.listinoAcquisto.widths,
          heights: line.listinoAcquisto.heights,
          matrix: line.listinoAcquisto.matrix,
        })
      } else {
        value = String(line.listinoAcquisto)
        const resolved = resolvePriceListType(line.priceListType ?? '', parsed.templateVersion)
        if (resolved.kind === 'formula') {
          formula = resolved.formula
        }
      }

      const lineId = await insertProductLine(tx, {
        productFamilyId: familyId,
        name: line.name,
        description: line.description,
        formula,
        value,
        pricingMatrixId,
        minValue: line.minValue == null ? null : String(line.minValue),
        unitName: line.unitName,
        unitSymbol: line.unitSymbol,
        discountPct: toStoredPct(line.discountPct),
        markupPct: toStoredPct(line.markupPct),
        installationHoursPerUnit: line.installationHoursPerUnit == null ? null : String(line.installationHoursPerUnit),
        sortOrder: index,
      })
      lineIdByName.set(line.name, lineId)
    }

    const mainCharacteristicIdByName = new Map<string, string>()

    for (const [mainIndex, main] of parsed.characteristics.entries()) {
      const mainId = await insertCharacteristic(tx, {
        productFamilyId: familyId,
        parentId: null,
        name: main.name,
        sortOrder: mainIndex,
      })
      mainCharacteristicIdByName.set(main.name, mainId)

      for (const [subIndex, sub] of main.subCharacters.entries()) {
        let pricingMatrixId: string | null = null
        let value: string | null = null
        let formula: string | null = null

        if (isMatrix(sub.listinoAcquisto)) {
          pricingMatrixId = await insertPricingMatrix(tx, {
            productFamilyId: familyId,
            widths: sub.listinoAcquisto.widths,
            heights: sub.listinoAcquisto.heights,
            matrix: sub.listinoAcquisto.matrix,
          })
        } else {
          value = String(sub.listinoAcquisto)
          const resolved = resolvePriceListType(sub.priceListType ?? '', parsed.templateVersion)
          if (resolved.kind === 'formula') {
            formula = resolved.formula
          }
        }

        await insertCharacteristic(tx, {
          productFamilyId: familyId,
          parentId: mainId,
          name: sub.name,
          formula,
          value,
          pricingMatrixId,
          minValue: sub.minValue == null ? null : String(sub.minValue),
          discountPct: toStoredPct(sub.discountPct),
          markupPct: toStoredPct(sub.markupPct),
          installationHoursPerUnit: sub.installationHoursPerUnit == null ? null : String(sub.installationHoursPerUnit),
          sortOrder: subIndex,
        })
      }
    }

    for (const relation of parsed.relations) {
      const lineId = lineIdByName.get(relation.productLineName)
      const characteristicId = mainCharacteristicIdByName.get(relation.characteristicName)
      if (lineId && characteristicId) {
        await insertProductLineCharacteristic(tx, lineId, characteristicId)
      }
    }

    await recordAuditEvent(tx, auditActor(actor), supplierCompanyId, {
      action: versionOptions ? 'product_family.new_version' : 'product_family.import',
      resourceType: 'product_family',
      resourceId: familyId,
      metadata: {
        fileName: file.originalName,
        productLinesCount: parsed.productLines.length,
        characteristicsCount: parsed.characteristics.length,
        imagesCount: savedImages.length,
        ...priceValidity,
        // Part of this entry, not a separate product_family.publish: both would share the
        // transaction's timestamp, so their order in the history would be arbitrary.
        published: options.publish ?? false,
        readyForInvoicing: options.readyForInvoicing ?? false,
        ...(versionOptions ? { supersedesId: versionOptions.supersedesId, version: versionOptions.version } : {}),
      },
    })

    const detail = await getProductFamilyDetailQuery(tx, familyId)
    // Detected from the two versions' content now, so viewing them later doesn't recompute it.
    if (versionOptions) await storeFamilyChanges(tx, versionOptions.previous, detail!)
    return detail!.family
  })

  return family
}

/**
 * Families visible to the caller's company. Those it took out of its library are left out
 * unless `includeOutOfLibrary` — for its library managers (admins and managers).
 */
export const listProductFamilies = async (
  ctx: TenantContext,
  { includeOutOfLibrary = true, includeArchived = false }: { includeOutOfLibrary?: boolean; includeArchived?: boolean } = {},
): Promise<ProductFamilyListItem[]> => {
  const families = await withTenantDb(ctx, (tx) =>
    listVisibleProductFamilies(tx, ctx.effectiveCompanyId, { includeArchived }),
  )
  return includeOutOfLibrary ? families : families.filter((family) => family.inLibrary)
}

/** Line names for families the caller can already see. One query, not one detail load per family. */
export const listLinesForFamilies = (ctx: TenantContext, familyIds: string[]) =>
  withTenantDb(ctx, (tx) => listProductLineNames(tx, familyIds))

export const getProductFamilyDetail = (
  ctx: TenantContext,
  familyId: string,
): Promise<ProductFamilyDetail | null> => {
  if (!isUuid(familyId)) return Promise.resolve(null)
  return withTenantDb(ctx, (tx) => getProductFamilyDetailQuery(tx, familyId))
}

const toVersionSummary = (v: ProductFamilySummary): FamilyVersionSummary => ({
  id: v.id,
  name: v.name,
  version: v.version,
  duplicatedFromId: v.duplicatedFromId,
  isPublished: v.isPublished,
  readyForInvoicing: v.readyForInvoicing,
  priceValidFrom: v.priceValidFrom,
  priceValidTo: v.priceValidTo,
  createdAt: v.createdAt.toISOString(),
})

type VersionGraph = {
  versions: ProductFamilySummary[]
  branches: { forkFromId: string; versions: ProductFamilySummary[] }[]
  origin: ProductFamilySummary | null
}

/**
 * The family's chain, the family its first version was copied from and — unless `branches` is
 * false (callers that only need the chain) — the copies made from any of its versions, each with
 * its own chain. One level each way, all under the caller's RLS. Null when the caller can't see
 * `familyId`.
 */
const loadVersionGraph = async (
  tx: Parameters<typeof listProductFamilyVersions>[0],
  familyId: string,
  { branches: withBranches = true }: { branches?: boolean } = {},
): Promise<VersionGraph | null> => {
  const versions = await listProductFamilyVersions(tx, familyId)
  if (!versions.length) return null
  const inGraph = new Set(versions.map((v) => v.id))
  const branches: VersionGraph['branches'] = []
  if (withBranches) {
    const copies = (await listProductFamilyCopies(tx, [...inGraph])).filter((copy) => !inGraph.has(copy.id))
    // Every copy's chain in one query, then one branch per chain (two copies in one chain are one branch).
    const branchStarts = new Set<string>()
    for (const chain of (await listProductFamilyVersionsOfChains(tx, copies.map((copy) => copy.id))).values()) {
      if (!chain.length || branchStarts.has(chain[0].id)) continue
      branchStarts.add(chain[0].id)
      const fork = chain.find((v) => v.duplicatedFromId && inGraph.has(v.duplicatedFromId))
      if (fork) branches.push({ forkFromId: fork.duplicatedFromId!, versions: chain })
    }
    branches.sort((x, y) => x.versions[0].createdAt.getTime() - y.versions[0].createdAt.getTime())
    branches.forEach((branch) => branch.versions.forEach((v) => inGraph.add(v.id)))
  }
  const originId = versions.find((v) => v.duplicatedFromId && !inGraph.has(v.duplicatedFromId))?.duplicatedFromId
  const origin = originId ? await getProductFamilyById(tx, originId) : null
  return { versions, branches, origin }
}

const graphFamilies = (graph: VersionGraph) => [
  ...graph.versions,
  ...graph.branches.flatMap((branch) => branch.versions),
  ...(graph.origin ? [graph.origin] : []),
]

/** Every edge of the graph: each version → the next one, and original → copy. */
const graphEdges = ({ versions, branches, origin }: VersionGraph): [string, string][] => {
  const chainEdges = (chain: ProductFamilySummary[]) => chain.slice(1).map((v, i): [string, string] => [chain[i].id, v.id])
  const forkEdges = (chain: ProductFamilySummary[], fromIds: Set<string>) =>
    chain.filter((v) => v.duplicatedFromId && fromIds.has(v.duplicatedFromId)).map((v): [string, string] => [v.duplicatedFromId!, v.id])
  return [
    ...(origin ? forkEdges(versions, new Set([origin.id])) : []),
    ...chainEdges(versions),
    ...branches.flatMap((branch) => [...forkEdges(branch.versions, new Set([branch.forkFromId])), ...chainEdges(branch.versions)]),
  ]
}

/**
 * The family's version graph (see `FamilyVersionsResponse`). With `withSteps`, also the
 * change counts along every edge — that loads and compares every version, so the page
 * asks for it separately; `withBranches: false` leaves out the copies (callers that only
 * need the chain and the original). Null when the caller can't see `familyId`.
 */
export const getProductFamilyVersions = (
  ctx: TenantContext,
  familyId: string,
  { withSteps = false, withBranches = true }: { withSteps?: boolean; withBranches?: boolean } = {},
): Promise<FamilyVersionsResponse | null> => {
  if (!isUuid(familyId)) return Promise.resolve(null)
  return withTenantDb(ctx, async (tx) => {
    const graph = await loadVersionGraph(tx, familyId, { branches: withBranches })
    if (!graph) return null
    const steps: FamilyVersionsResponse['steps'] = []
    if (withSteps) {
      const stored = await listStoredFamilyChanges(tx, graphFamilies(graph).map((family) => family.id))
      // One at a time (they share the transaction's single connection), each version loaded at most once.
      const loaded: ProductFamilyDetail[] = []
      for (const [fromId, toId] of graphEdges(graph)) {
        // Every id was just listed under the same RLS, so neither family can be missing.
        const changes = await familyChanges(tx, fromId, toId, { stored, loaded })
        if (changes) steps.push({ fromId, toId, counts: countFamilyChanges(changes) })
      }
    }
    return {
      versions: graph.versions.map(toVersionSummary),
      branches: graph.branches.map((branch) => ({ forkFromId: branch.forkFromId, versions: branch.versions.map(toVersionSummary) })),
      origin: graph.origin ? toVersionSummary(graph.origin) : null,
      edges: graphEdges(graph).map(([fromId, toId]) => ({ fromId, toId })),
      steps,
    }
  })
}

/** Loads family details under the caller's RLS, each at most once: from `loaded`, else the DB (then kept in `loaded`). */
const detailLoader = (tx: Parameters<typeof listProductFamilyVersions>[0], loaded: ProductFamilyDetail[]) => async (id: string) => {
  const known = loaded.find((detail) => detail.family.id === id)
  if (known) return known
  const detail = await getProductFamilyDetailQuery(tx, id)
  if (detail) loaded.push(detail)
  return detail
}

/**
 * What changed from `olderId` to `newerId`, both read under the caller's RLS; null when either is
 * missing. The stored change list when there is a current one, otherwise compared now — reading
 * never stores (see `storeFamilyChanges` / `refreshFamilyChanges`). `stored` is the caller's
 * already-loaded stored lists (else they're looked up), and `loaded` the details it already has;
 * details loaded here are added to it, so a caller comparing many pairs loads each family once.
 */
const familyChanges = async (
  tx: Parameters<typeof listProductFamilyVersions>[0],
  olderId: string,
  newerId: string,
  { stored, loaded = [] }: { stored?: StoredFamilyChanges[]; loaded?: ProductFamilyDetail[] } = {},
): Promise<FamilyChangeNode[] | null> => {
  const row = (stored ?? (await listStoredFamilyChanges(tx, [newerId]))).find(
    (r) => r.productFamilyId === newerId && r.fromFamilyId === olderId && r.diffVersion === FAMILY_DIFF_VERSION,
  )
  if (row) return row.changes as FamilyChangeNode[]
  const load = detailLoader(tx, loaded)
  const older = await load(olderId)
  const newer = older ? await load(newerId) : null
  return older && newer ? diffFamilyVersions(older, newer) : null
}

/** Detects what changed from `older` to `newer` and stores it — when the newer one is created. */
const storeFamilyChanges = (tx: Parameters<typeof listProductFamilyVersions>[0], older: ProductFamilyDetail, newer: ProductFamilyDetail) =>
  saveFamilyChanges(tx, {
    productFamilyId: newer.family.id,
    fromFamilyId: older.family.id,
    diffVersion: FAMILY_DIFF_VERSION,
    changes: diffFamilyVersions(older, newer),
  })

/**
 * After an edit of a family's content: detects again every stored change list it is either side
 * of. Lists whose newer family the caller doesn't own are left (copies and versions are always
 * the same owner's, so there are none in practice).
 */
const refreshFamilyChanges = async (tx: Parameters<typeof listProductFamilyVersions>[0], ctx: TenantContext, familyId: string) => {
  const rows = await listFamilyChangesInvolving(tx, familyId)
  const load = detailLoader(tx, [])
  for (const row of rows) {
    const older = await load(row.fromFamilyId)
    const newer = await load(row.productFamilyId)
    if (older && newer && canManageProductFamily(ctx, newer.family)) await storeFamilyChanges(tx, older, newer)
  }
}

/**
 * Stores the change list of every version and copy that has no current one: families created
 * before change lists were stored, or stored by an older `FAMILY_DIFF_VERSION`. Pass a system
 * (RLS-bypassing) transaction. Returns how many lists it stored.
 */
export const backfillFamilyChanges = async (tx: Parameters<typeof listProductFamilyVersions>[0]): Promise<number> => {
  const families = await listFamilyPredecessors(tx)
  const current = new Set(
    (await listStoredFamilyChanges(tx, families.map((family) => family.id)))
      .filter((row) => row.diffVersion === FAMILY_DIFF_VERSION)
      .map((row) => `${row.fromFamilyId}>${row.productFamilyId}`),
  )
  const load = detailLoader(tx, [])
  let count = 0
  for (const family of families) {
    for (const fromId of [family.supersedesId, family.duplicatedFromId]) {
      if (!fromId || current.has(`${fromId}>${family.id}`)) continue
      const older = await load(fromId)
      const newer = await load(family.id)
      if (!older || !newer) continue
      await storeFamilyChanges(tx, older, newer)
      count++
    }
  }
  return count
}

/**
 * What changed between two families of the same version graph — two versions, or a copy and
 * its original — older → newer by creation, whichever is passed first. Null when either isn't
 * visible to the caller or they aren't in the graph of either one.
 */
export const compareProductFamilyVersions = (
  ctx: TenantContext,
  familyId: string,
  otherId: string,
): Promise<FamilyVersionComparison | null> => {
  if (!isUuid(familyId) || !isUuid(otherId) || familyId === otherId) return Promise.resolve(null)
  return withTenantDb(ctx, async (tx) => {
    const pairIn = (graph: VersionGraph | null) =>
      graph ? graphFamilies(graph).filter((v) => v.id === familyId || v.id === otherId) : []
    // Cheapest first: the chain and its original; then the copies; then the other side's graph (a copy seen from its original's original).
    let pair = pairIn(await loadVersionGraph(tx, familyId, { branches: false }))
    if (pair.length < 2) pair = pairIn(await loadVersionGraph(tx, familyId))
    if (pair.length < 2) pair = pairIn(await loadVersionGraph(tx, otherId))
    const [older, newer] = pair.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    if (!older || !newer) return null
    const changes = await familyChanges(tx, older.id, newer.id)
    if (!changes) return null
    return {
      from: { id: older.id, name: older.name, version: older.version },
      to: { id: newer.id, name: newer.name, version: newer.version },
      changes,
      counts: countFamilyChanges(changes),
    }
  })
}

/**
 * Re-imports an updated Excel workbook as a new *version* of an existing
 * family — a fresh parse of the new file (not a copy-then-edit of the old
 * version's rows). `existingFamilyId` can be ANY version in the chain,
 * not just the latest one: this always walks forward to find the actual
 * latest version first (see `findLatestProductFamilyVersion`), then
 * inserts with `version = latest.version + 1` and `supersedesId =
 * latest.id`. Without this, re-importing from an older version's page a
 * second time would recompute the same "next" version number instead of
 * continuing the chain (e.g. uploading from v1 twice would produce v2
 * twice instead of v2 then v3). The existing version(s) are left exactly
 * as they were (still published if they were published) — publishing/
 * unpublishing either version is a separate, explicit action, same as
 * every other publish-state change in this service.
 * @throws {Error} the existing family doesn't exist or isn't visible/owned by the caller
 * @throws {ExcelImportError} the new workbook is missing a required sheet, or uses an unrecognized Tipo_Listino
 */
export const createNewVersionFromExcel = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  existingFamilyId: string,
  file: { buffer: Buffer; originalName: string },
  options: Omit<ProductFamilyImportOptions, 'version'> = {},
): Promise<ProductFamilySummary> => {
  const existing = await getProductFamilyDetail(ctx, existingFamilyId)
  if (!existing) {
    throw new Error('Product family not found')
  }

  const latest = await withTenantDb(ctx, (tx) => findLatestProductFamilyVersion(tx, existingFamilyId))
  // The version this one replaces, to detect what changed; usually the one the upload started from.
  const previous = latest.id === existing.family.id ? existing : await getProductFamilyDetail(ctx, latest.id)
  if (!previous) {
    throw new Error('Product family not found')
  }

  return importProductFamilyFromExcel(ctx, actor, existing.family.supplierCompanyId, file, {
    // Set by hand, not from the file, so the new version keeps the one it replaces has.
    hasPriceList: latest.hasPriceList,
    ...options,
    version: { version: latest.version + 1, supersedesId: latest.id, previous },
  })
}

/**
 * Deep-copies a product family (its own lines, characteristics, pricing
 * matrices, and line/characteristic relations) into a new, independent,
 * unpublished draft. Image rows are copied too but point at the same
 * `localPath` — the duplicate references the same on-disk image bytes,
 * no file copy, since neither row can ever mutate the other's image file
 * in place (only replace-by-inserting-a-new-image, which would just add
 * a new row pointing at a new path).
 * @param ctx - Tenant context resolved by `requireAuth`
 * @param actor - Who's duplicating, for the audit record
 * @param familyId - Family to duplicate
 * @param options - The copy's name, price validity and publish choice, from the copy dialog
 * @throws {ProductFamilyNotFoundError} the source family doesn't exist or isn't visible to the caller
 */
export const duplicateProductFamily = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  options: DuplicateProductFamilyRequest,
): Promise<ProductFamilySummary> =>
  withTenantDb(ctx, async (tx) => {
    const source = await getProductFamilyDetailQuery(tx, familyId)
    if (!source) {
      throw new ProductFamilyNotFoundError()
    }
    const { priceValidFrom, priceValidTo, publish: published, readyForInvoicing } = options

    const newFamilyId = await insertProductFamily(tx, {
      supplierCompanyId: source.family.supplierCompanyId,
      name: options.name,
      technicalName: source.family.technicalName,
      category: source.family.category,
      brand: source.family.brand,
      description1: source.family.description1,
      description2: source.family.description2,
      note: source.family.note,
      distributor: source.family.distributor,
      priceValidFrom,
      priceValidTo,
      isPublished: published,
      readyForInvoicing,
      hasPriceList: source.family.hasPriceList,
      duplicatedFromId: familyId,
    })

    for (const image of source.images) {
      await insertProductFamilyImage(tx, {
        productFamilyId: newFamilyId,
        title: image.title,
        localPath: image.localPath,
        sortOrder: image.sortOrder,
      })
    }

    const matrixIdMap = new Map<string, string>()
    for (const matrix of source.matrices) {
      const newMatrixId = await insertPricingMatrix(tx, {
        productFamilyId: newFamilyId,
        widths: matrix.widths,
        heights: matrix.heights,
        matrix: matrix.matrix,
      })
      matrixIdMap.set(matrix.id, newMatrixId)
    }

    const lineIdMap = new Map<string, string>()
    for (const line of source.lines) {
      const newLineId = await insertProductLine(tx, {
        productFamilyId: newFamilyId,
        name: line.name,
        description: line.description,
        formula: line.formula,
        value: line.value,
        pricingMatrixId: line.pricingMatrixId ? matrixIdMap.get(line.pricingMatrixId) : null,
        minValue: line.minValue,
        unitName: line.unitName,
        unitSymbol: line.unitSymbol,
        discountPct: line.discountPct,
        markupPct: line.markupPct,
        installationHoursPerUnit: line.installationHoursPerUnit,
        sortOrder: line.sortOrder,
      })
      lineIdMap.set(line.id, newLineId)
    }

    // Characteristics can self-reference (parentId); insert main rows
    // (parentId null) first so sub-rows have a new parent id to point to.
    const characteristicIdMap = new Map<string, string>()
    const mainRows = source.characteristics.filter((c) => !c.parentId)
    const subRows = source.characteristics.filter((c) => c.parentId)

    for (const main of mainRows) {
      const newId = await insertCharacteristic(tx, {
        productFamilyId: newFamilyId,
        parentId: null,
        name: main.name,
        isApplicable: main.isApplicable,
        sortOrder: main.sortOrder,
      })
      characteristicIdMap.set(main.id, newId)
    }
    for (const sub of subRows) {
      const newId = await insertCharacteristic(tx, {
        productFamilyId: newFamilyId,
        parentId: sub.parentId ? characteristicIdMap.get(sub.parentId) : null,
        name: sub.name,
        isApplicable: sub.isApplicable,
        formula: sub.formula,
        value: sub.value,
        pricingMatrixId: sub.pricingMatrixId ? matrixIdMap.get(sub.pricingMatrixId) : null,
        minValue: sub.minValue,
        discountPct: sub.discountPct,
        markupPct: sub.markupPct,
        installationHoursPerUnit: sub.installationHoursPerUnit,
        sortOrder: sub.sortOrder,
      })
      characteristicIdMap.set(sub.id, newId)
    }

    for (const relation of source.relations) {
      const newLineId = lineIdMap.get(relation.productLineId)
      const newCharacteristicId = characteristicIdMap.get(relation.characteristicId)
      if (newLineId && newCharacteristicId) {
        await insertProductLineCharacteristic(tx, newLineId, newCharacteristicId)
      }
    }

    await recordAuditEvent(
      tx,
      auditActor(actor),
      source.family.supplierCompanyId,
      {
        action: 'product_family.duplicate',
        resourceType: 'product_family',
        resourceId: newFamilyId,
        metadata: { duplicatedFromId: familyId, priceValidFrom, priceValidTo, published, readyForInvoicing },
      },
    )

    const detail = await getProductFamilyDetailQuery(tx, newFamilyId)
    await storeFamilyChanges(tx, source, detail!)
    return detail!.family
  })

/**
 * @throws {ProductFamilyNotFoundError} no such family, or RLS silently
 *   blocked the UPDATE (visible-but-not-owned, e.g. a linked client) —
 *   both surface as "not found", never a silent no-op success.
 */
export const setProductFamilyPublishedStatus = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  isPublished: boolean,
): Promise<void> =>
  withTenantDb(ctx, async (tx) => {
    const updated = await setProductFamilyPublished(tx, familyId, isPublished)
    if (!updated) {
      throw new ProductFamilyNotFoundError()
    }
    await recordAuditEvent(
      tx,
      auditActor(actor),
      // The family's own supplierCompanyId, not ctx.effectiveCompanyId —
      // so a super-admin publish/unpublish is attributed to the actual
      // supplier tenant, not the super-admin's own platform company.
      updated.supplierCompanyId,
      {
        action: isPublished ? 'product_family.publish' : 'product_family.unpublish',
        resourceType: 'product_family',
        resourceId: familyId,
      },
    )
  })

/**
 * Marks a family ready (or not) for invoicing — only ready families are offered for
 * new quote positions. Positions already on quotes are left as they are.
 * @throws {ProductFamilyNotFoundError} no such family, or the caller doesn't own it (RLS blocked the UPDATE)
 */
export const setProductFamilyReadyForInvoicingStatus = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  readyForInvoicing: boolean,
): Promise<void> =>
  withTenantDb(ctx, async (tx) => {
    const updated = await setProductFamilyReadyForInvoicing(tx, familyId, readyForInvoicing)
    if (!updated) {
      throw new ProductFamilyNotFoundError()
    }
    await recordAuditEvent(tx, auditActor(actor), updated.supplierCompanyId, {
      action: readyForInvoicing ? 'product_family.ready_for_invoicing' : 'product_family.not_ready_for_invoicing',
      resourceType: 'product_family',
      resourceId: familyId,
    })
  })

/**
 * Sets whether the family has a price list ("Con listino") — information shown in
 * the quote builder; it doesn't stop the family from being quoted.
 * @throws {ProductFamilyNotFoundError} no such family, or the caller doesn't own it (RLS blocked the UPDATE)
 */
export const setProductFamilyHasPriceListStatus = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  hasPriceList: boolean,
): Promise<void> =>
  withTenantDb(ctx, async (tx) => {
    const updated = await setProductFamilyHasPriceList(tx, familyId, hasPriceList)
    if (!updated) {
      throw new ProductFamilyNotFoundError()
    }
    await refreshFamilyChanges(tx, ctx, familyId)
    await recordAuditEvent(tx, auditActor(actor), updated.supplierCompanyId, {
      action: hasPriceList ? 'product_family.price_list_set' : 'product_family.price_list_unset',
      resourceType: 'product_family',
      resourceId: familyId,
    })
  })

/** Whether the family is in the caller's company library ("In libreria"). */
export const isFamilyInCompanyLibrary = (ctx: TenantContext, familyId: string): Promise<boolean> =>
  withTenantDb(ctx, (tx) => isProductFamilyInLibrary(tx, ctx.effectiveCompanyId, familyId))

/** `getProductFamilyDetail` plus whether the family is in the caller's company library, in one transaction. */
export const getProductFamilyDetailWithLibrary = (
  ctx: TenantContext,
  familyId: string,
): Promise<(ProductFamilyDetail & { inLibrary: boolean }) | null> =>
  withTenantDb(ctx, async (tx) => {
    const detail = await getProductFamilyDetailQuery(tx, familyId)
    return detail ? { ...detail, inLibrary: await isProductFamilyInLibrary(tx, ctx.effectiveCompanyId, familyId) } : null
  })

/**
 * Puts a family back in, or takes it out of, the caller's company library ("In libreria").
 * Out of the library, the company's quote builder no longer offers it; positions already
 * on quotes are not affected. Works on the company's own families and on families shared
 * with it — each company decides for itself.
 * @throws {ProductFamilyNotFoundError} the family doesn't exist or the caller's company can't see it
 */
export const setProductFamilyLibraryStatus = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  inLibrary: boolean,
): Promise<void> =>
  withTenantDb(ctx, async (tx) => {
    const family = await getProductFamilyById(tx, familyId)
    // Checked here, not left to RLS: a super-admin acting as the company would see every family.
    const visible =
      !!family &&
      (family.supplierCompanyId === ctx.effectiveCompanyId ||
        (family.isPublished && (await isFamilySharedWith(tx, familyId, ctx.effectiveCompanyId))))
    if (!visible) {
      throw new ProductFamilyNotFoundError()
    }
    if ((await isProductFamilyInLibrary(tx, ctx.effectiveCompanyId, familyId)) === inLibrary) {
      return
    }
    await setProductFamilyInLibrary(tx, {
      companyId: ctx.effectiveCompanyId,
      familyId,
      inLibrary,
      userId: actor.actorUserId || null,
    })
    // Filed under the company that decided, not the family's owner: it's that company's library.
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: inLibrary ? 'product_family.library_add' : 'product_family.library_remove',
      resourceType: 'product_family',
      resourceId: familyId,
    })
  })

/**
 * Changes the days a family's prices may be used on new quote positions.
 * Positions already on quotes keep their snapshotted prices either way.
 * @throws {PriceValidityOverlapError} the dates share a day with another version of the family (nothing is saved)
 * @throws {ProductFamilyNotFoundError} no such family, or the caller doesn't own it (RLS blocked the UPDATE)
 */
export const setProductFamilyPriceValidityDates = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  validity: PriceValidityRequest,
): Promise<PriceValidityRequest> =>
  withTenantDb(ctx, async (tx) => {
    const before = await getProductFamilyById(tx, familyId)
    if (!before) {
      throw new ProductFamilyNotFoundError()
    }
    await assertNoValidityOverlap(tx, familyId, validity, familyId)
    const updated = await setProductFamilyPriceValidity(tx, familyId, validity)
    if (!updated) {
      throw new ProductFamilyNotFoundError()
    }
    await refreshFamilyChanges(tx, ctx, familyId)
    await recordAuditEvent(tx, auditActor(actor), updated.supplierCompanyId, {
      action: 'product_family.price_validity_update',
      resourceType: 'product_family',
      resourceId: familyId,
      metadata: {
        ...validity,
        previousPriceValidFrom: before.priceValidFrom,
        previousPriceValidTo: before.priceValidTo,
      },
    })
    return validity
  })

/**
 * Permanently deletes a product family and everything under it (lines,
 * characteristics, pricing matrices, images, line/characteristic
 * relations — all cascade via FK). RLS restricts this to the owning
 * supplier company or a super-admin; a caller without access simply
 * deletes zero rows rather than erroring, so this throws explicitly
 * instead of silently no-op'ing.
 * @throws if the family doesn't exist or isn't visible/owned by the caller
 */
export const deleteProductFamily = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
): Promise<void> =>
  withTenantDb(ctx, async (tx) => {
    const wasDeleted = await deleteProductFamilyQuery(tx, familyId)
    if (!wasDeleted) {
      throw new Error('Product family not found')
    }
    await recordAuditEvent(
      tx,
      auditActor(actor),
      ctx.effectiveCompanyId,
      {
        action: 'product_family.delete',
        resourceType: 'product_family',
        resourceId: familyId,
      },
    )
  })

/**
 * Runs one pricing edit inside a single RLS transaction: loads the family
 * (404 if missing/not visible), enforces the edit policy (409 when locked),
 * applies `apply`, bumps the family's `updatedAt`, and writes an audit
 * record listing which fields changed (never the values — a whole matrix
 * would bloat the append-only audit log).
 */
const editFamilyPricing = <T>(
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  audit: { action: string; itemType: 'line' | 'characteristic' | 'matrix'; itemId: string; changed: string[] },
  apply: (tx: Parameters<Parameters<typeof withTenantDb>[1]>[0]) => Promise<T | null>,
): Promise<T> =>
  withTenantDb(ctx, async (tx) => {
    const family = await getProductFamilyById(tx, familyId)
    if (!family) {
      throw new ProductFamilyNotFoundError()
    }
    if (!isProductFamilyEditable(family)) {
      throw new ProductFamilyLockedError()
    }

    const row = await apply(tx)
    if (!row) {
      throw new ProductFamilyNotFoundError('Item not found in this product family, or not editable')
    }

    await touchProductFamily(tx, familyId)
    await refreshFamilyChanges(tx, ctx, familyId)
    await recordAuditEvent(tx, auditActor(actor), family.supplierCompanyId, {
      action: audit.action,
      // Filed under the family (its history panel finds it by resourceId); the edited item is in the metadata.
      resourceType: 'product_family',
      resourceId: familyId,
      metadata: { productFamilyId: familyId, itemType: audit.itemType, itemId: audit.itemId, changed: audit.changed },
    })
    return row
  })

/**
 * Replaces a pricing matrix's axes and cells.
 * @throws {ProductFamilyValidationError} malformed input (see `validateMatrixInput`)
 * @throws {ProductFamilyLockedError} the family is locked by the edit policy
 * @throws {ProductFamilyNotFoundError} no such family/matrix for this caller
 */
export const updatePricingMatrix = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  matrixId: string,
  input: unknown,
): Promise<PricingMatrixRow> => {
  const validated = validateMatrixInput(input)
  return editFamilyPricing(
    ctx,
    actor,
    familyId,
    { action: 'product_family.matrix_update', itemType: 'matrix', itemId: matrixId, changed: ['widths', 'heights', 'matrix'] },
    (tx) => updatePricingMatrixQuery(tx, familyId, matrixId, validated),
  )
}

type CatalogTx = Parameters<Parameters<typeof withTenantDb>[1]>[0]

/** Rejects ids that are not main characteristics of this family. */
const assertMainCharacteristics = async (tx: CatalogTx, familyId: string, characteristicIds: string[]): Promise<void> => {
  const mains = new Set(await listMainCharacteristicIds(tx, familyId))
  if (characteristicIds.some((id) => !mains.has(id))) {
    throw new ProductFamilyValidationError('characteristicIds must be characteristics of this family')
  }
}

/**
 * Writes a formula price or a price table onto a line or option.
 * Returns the id of a table that was detached, so the caller can delete it once nothing uses it.
 */
const applyPriceMode = async (
  tx: CatalogTx,
  familyId: string,
  currentMatrixId: string | null,
  price: ValidatedPriceMode,
  columns: { formula?: string | null; value?: string | null; pricingMatrixId?: string | null },
  owner: 'line' | 'option',
): Promise<string | null> => {
  if (price.kind === 'formula') {
    columns.formula = price.formula
    columns.value = price.value
    columns.pricingMatrixId = null
    return currentMatrixId
  }
  const matrix = { widths: price.widths, heights: price.heights, matrix: price.matrix }
  if (currentMatrixId) {
    const updated = await updatePricingMatrixQuery(tx, familyId, currentMatrixId, matrix)
    if (!updated) throw new ProductFamilyNotFoundError('Price table not found in this product family')
    columns.pricingMatrixId = currentMatrixId
  } else {
    columns.pricingMatrixId = await insertPricingMatrix(tx, { productFamilyId: familyId, ...matrix })
  }
  columns.formula = owner === 'line' ? 'valore' : null
  columns.value = owner === 'line' ? '0' : null
  return null
}

const lineColumns = (patch: ValidatedLinePatch): UpdateProductLineInput => {
  const columns: UpdateProductLineInput = {}
  if (patch.name !== undefined) columns.name = patch.name
  if (patch.description !== undefined) columns.description = patch.description
  if (patch.unitName !== undefined) columns.unitName = patch.unitName
  if (patch.unitSymbol !== undefined) columns.unitSymbol = patch.unitSymbol
  if (patch.formula !== undefined) columns.formula = patch.formula
  if (patch.value !== undefined) columns.value = patch.value
  if (patch.minValue !== undefined) columns.minValue = patch.minValue
  if (patch.discountPct !== undefined) columns.discountPct = patch.discountPct
  if (patch.markupPct !== undefined) columns.markupPct = patch.markupPct
  if (patch.installationHoursPerUnit !== undefined) columns.installationHoursPerUnit = patch.installationHoursPerUnit
  return columns
}

const optionColumns = (patch: ValidatedCharacteristicPatch): UpdateCharacteristicInput => {
  const columns: UpdateCharacteristicInput = {}
  if (patch.name !== undefined) columns.name = patch.name
  if (patch.formula !== undefined) columns.formula = patch.formula
  if (patch.value !== undefined) columns.value = patch.value
  if (patch.minValue !== undefined) columns.minValue = patch.minValue
  if (patch.discountPct !== undefined) columns.discountPct = patch.discountPct
  if (patch.markupPct !== undefined) columns.markupPct = patch.markupPct
  if (patch.installationHoursPerUnit !== undefined) columns.installationHoursPerUnit = patch.installationHoursPerUnit
  return columns
}

/**
 * Same lock, touch, change-list refresh and audit as {@link editFamilyPricing}, for writes whose
 * id (or name) is only known after the write — creating and deleting a line, characteristic or image.
 */
const editFamilyCatalog = async <T extends { id: string }>(
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  describe: (result: T) => { action: string; itemType: string; changed: string[]; name?: string | null; skip?: boolean },
  apply: (tx: CatalogTx) => Promise<T | null>,
): Promise<T> =>
  withTenantDb(ctx, async (tx) => {
    const family = await getProductFamilyById(tx, familyId)
    if (!family) throw new ProductFamilyNotFoundError()
    if (!isProductFamilyEditable(family)) throw new ProductFamilyLockedError()
    const result = await apply(tx)
    if (!result) throw new ProductFamilyNotFoundError('Item not found in this product family, or not editable')
    const audit = describe(result)
    if (audit.skip) return result
    await touchProductFamily(tx, familyId)
    await refreshFamilyChanges(tx, ctx, familyId)
    await recordAuditEvent(tx, auditActor(actor), family.supplierCompanyId, {
      action: audit.action,
      resourceType: 'product_family',
      resourceId: familyId,
      metadata: {
        productFamilyId: familyId,
        itemType: audit.itemType,
        itemId: result.id,
        changed: audit.changed,
        ...(audit.name ? { name: audit.name } : {}),
      },
    })
    return result
  })

const duplicateLineName = (name: string) => new ProductFamilyValidationError(`A product line named "${name}" already exists`)
const duplicateCharacteristicName = (name: string, option: boolean) =>
  new ProductFamilyValidationError(option ? `An option named "${name}" already exists` : `A characteristic named "${name}" already exists`)

/**
 * Creates an empty product family (no lines, characteristics or images) for the caller's company.
 * @throws {ProductFamilyValidationError} the body is missing a name or the dates are invalid
 */
export const createProductFamily = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  input: unknown,
): Promise<ProductFamilySummary> => {
  const parsed = createProductFamilyRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new ProductFamilyValidationError(parsed.error.issues[0]?.message ?? 'Invalid request body')
  }
  const data = parsed.data
  return withTenantDb(ctx, async (tx) => {
    const familyId = await insertProductFamily(tx, {
      supplierCompanyId: ctx.effectiveCompanyId,
      name: data.name,
      technicalName: data.technicalName ?? null,
      category: data.category ?? null,
      brand: data.brand ?? null,
      distributor: data.distributor ?? null,
      description1: data.description1 ?? null,
      description2: data.description2 ?? null,
      note: data.note ?? null,
      priceValidFrom: data.priceValidFrom,
      priceValidTo: data.priceValidTo ?? null,
      isPublished: data.publish,
      readyForInvoicing: data.readyForInvoicing,
      hasPriceList: true,
    })
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: 'product_family.create',
      resourceType: 'product_family',
      resourceId: familyId,
      metadata: {
        name: data.name,
        published: data.publish,
        readyForInvoicing: data.readyForInvoicing,
        priceValidFrom: data.priceValidFrom,
        priceValidTo: data.priceValidTo ?? null,
      },
    })
    const family = await getProductFamilyById(tx, familyId)
    if (!family) throw new ProductFamilyNotFoundError()
    return family
  })
}

/**
 * Edits a family's text fields (name, descriptions, brand, and the rest). Dates and flags stay on their own routes.
 * @throws {ProductFamilyValidationError} nothing to change, or a field is out of range
 * @throws {ProductFamilyLockedError} the family is locked by the edit policy
 * @throws {ProductFamilyNotFoundError} no such family for this caller
 */
export const updateProductFamilyDetails = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  input: unknown,
): Promise<ProductFamilySummary> => {
  const parsed = updateProductFamilyDetailsSchema.safeParse(input)
  if (!parsed.success) {
    throw new ProductFamilyValidationError(parsed.error.issues[0]?.message ?? 'Invalid request body')
  }
  const data = Object.fromEntries(Object.entries(parsed.data).filter((entry) => entry[1] !== undefined))
  const changed: string[] = []
  return editFamilyCatalog(
    ctx,
    actor,
    familyId,
    (family) => ({
      action: 'product_family.update',
      itemType: 'family',
      changed,
      name: family.name,
      skip: changed.length === 0,
    }),
    async (tx) => {
      const current = await getProductFamilyById(tx, familyId)
      if (!current) return null
      const stored = current as unknown as Record<string, unknown>
      const next = Object.fromEntries(Object.entries(data).filter(([key, value]) => stored[key] !== value))
      changed.push(...Object.keys(next))
      if (changed.length === 0) return current
      return updateProductFamilyDetailsQuery(tx, familyId, next)
    },
  )
}

/**
 * Edits a product line: its name, description, units, economics, which characteristics apply,
 * and its price (formula or a price table). Only the fields present in `input` change.
 * @throws same as {@link updatePricingMatrix}
 */
export const updateProductLine = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  lineId: string,
  input: unknown,
): Promise<ProductLineRow> => {
  const patch = validateLinePatch(input)
  return editFamilyPricing(
    ctx,
    actor,
    familyId,
    { action: 'product_family.line_update', itemType: 'line', itemId: lineId, changed: Object.keys(patch) },
    async (tx) => {
      const line = await getProductLineInFamily(tx, familyId, lineId)
      if (!line) return null
      if (patch.name && (await productLineNameTaken(tx, familyId, patch.name, lineId))) throw duplicateLineName(patch.name)
      if (patch.characteristicIds) await assertMainCharacteristics(tx, familyId, patch.characteristicIds)
      const columns = lineColumns(patch)
      const droppedMatrixId = patch.price ? await applyPriceMode(tx, familyId, line.pricingMatrixId, patch.price, columns, 'line') : null
      const updated = await updateProductLineQuery(tx, familyId, lineId, columns)
      if (!updated) return null
      if (patch.characteristicIds) await replaceProductLineCharacteristics(tx, lineId, patch.characteristicIds)
      if (droppedMatrixId) await deletePricingMatrixIfUnused(tx, familyId, droppedMatrixId)
      return updated
    },
  )
}

/** Adds a product line. `characteristicIds` are the main characteristics that apply; omit them for none. */
export const createProductLine = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  input: unknown,
): Promise<ProductLineRow> => {
  const spec = validateCreateProductLine(input)
  return editFamilyCatalog(
    ctx,
    actor,
    familyId,
    (line) => ({ action: 'product_family.line_create', itemType: 'line', changed: ['name'], name: line.name }),
    async (tx) => {
      if (await productLineNameTaken(tx, familyId, spec.name)) throw duplicateLineName(spec.name)
      if (spec.characteristicIds) await assertMainCharacteristics(tx, familyId, spec.characteristicIds)
      let pricingMatrixId: string | null = null
      let formula = 'valore'
      let value = '0'
      if (spec.price.kind === 'matrix') {
        pricingMatrixId = await insertPricingMatrix(tx, {
          productFamilyId: familyId,
          widths: spec.price.widths,
          heights: spec.price.heights,
          matrix: spec.price.matrix,
        })
      } else {
        formula = spec.price.formula
        value = spec.price.value
      }
      const lineId = await insertProductLine(tx, {
        productFamilyId: familyId,
        name: spec.name,
        description: spec.description ?? null,
        formula,
        value,
        pricingMatrixId,
        minValue: spec.minValue ?? null,
        unitName: spec.unitName,
        unitSymbol: spec.unitSymbol,
        discountPct: spec.discountPct ?? null,
        markupPct: spec.markupPct ?? null,
        installationHoursPerUnit: spec.installationHoursPerUnit ?? null,
        sortOrder: await nextProductLineSortOrder(tx, familyId),
      })
      if (spec.characteristicIds) await replaceProductLineCharacteristics(tx, lineId, spec.characteristicIds)
      return getProductLineInFamily(tx, familyId, lineId)
    },
  )
}

/** Deletes a product line and its price table when nothing else uses that table. */
export const deleteProductLine = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  lineId: string,
): Promise<void> => {
  await editFamilyCatalog<ProductLineRow>(
    ctx,
    actor,
    familyId,
    (line) => ({ action: 'product_family.line_delete', itemType: 'line', changed: [], name: line.name }),
    async (tx) => {
      const deleted = await deleteProductLineQuery(tx, familyId, lineId)
      if (!deleted) return null
      if (deleted.pricingMatrixId) await deletePricingMatrixIfUnused(tx, familyId, deleted.pricingMatrixId)
      return deleted
    },
  )
}

/**
 * Edits a characteristic. A main characteristic accepts a new name only — a price on one is
 * reported as not found, same as before options and mains shared this route. An option accepts
 * its name, economics and price (formula or a price table).
 * @throws same as {@link updatePricingMatrix}
 */
export const updateCharacteristic = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  characteristicId: string,
  input: unknown,
): Promise<CharacteristicRow> => {
  const patch = validateCharacteristicPatch(input)
  return editFamilyPricing(
    ctx,
    actor,
    familyId,
    { action: 'product_family.characteristic_update', itemType: 'characteristic', itemId: characteristicId, changed: Object.keys(patch) },
    async (tx) => {
      const row = await getCharacteristicInFamily(tx, familyId, characteristicId)
      if (!row) return null
      if (!row.parentId && characteristicPatchHasPrice(patch)) {
        if (patch.name === undefined) return null
        throw new ProductFamilyValidationError('A characteristic has no price of its own')
      }
      if (patch.name && (await characteristicNameTaken(tx, familyId, row.parentId, patch.name, row.id))) {
        throw duplicateCharacteristicName(patch.name, row.parentId !== null)
      }
      const columns = optionColumns(patch)
      const droppedMatrixId =
        patch.price && row.parentId ? await applyPriceMode(tx, familyId, row.pricingMatrixId, patch.price, columns, 'option') : null
      const updated = await updateCharacteristicQuery(tx, familyId, characteristicId, columns)
      if (!updated) return null
      if (droppedMatrixId) await deletePricingMatrixIfUnused(tx, familyId, droppedMatrixId)
      return updated
    },
  )
}

/**
 * Adds a main characteristic (linked to every current product line) or an option under one.
 * @throws {ProductFamilyValidationError} a duplicate name, a missing price on an option, or an unknown parent
 */
export const createCharacteristic = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  input: unknown,
): Promise<CharacteristicRow> => {
  const spec = validateCreateCharacteristic(input)
  return editFamilyCatalog(
    ctx,
    actor,
    familyId,
    (row) => ({
      action: 'product_family.characteristic_create',
      itemType: spec.kind === 'main' ? 'characteristic' : 'option',
      changed: ['name'],
      name: row.name,
    }),
    async (tx) => {
      if (spec.kind === 'main') {
        if (await characteristicNameTaken(tx, familyId, null, spec.name)) throw duplicateCharacteristicName(spec.name, false)
        const id = await insertCharacteristic(tx, {
          productFamilyId: familyId,
          parentId: null,
          name: spec.name,
          sortOrder: await nextCharacteristicSortOrder(tx, familyId, null),
        })
        await linkCharacteristicToAllLines(tx, familyId, id)
        return getCharacteristicInFamily(tx, familyId, id)
      }
      const parent = await getCharacteristicInFamily(tx, familyId, spec.parentId)
      if (!parent || parent.parentId) {
        throw new ProductFamilyValidationError('parentId must be a characteristic of this family')
      }
      if (await characteristicNameTaken(tx, familyId, spec.parentId, spec.name)) throw duplicateCharacteristicName(spec.name, true)
      let pricingMatrixId: string | null = null
      let formula: string | null = null
      let value: string | null = null
      if (spec.price.kind === 'matrix') {
        pricingMatrixId = await insertPricingMatrix(tx, {
          productFamilyId: familyId,
          widths: spec.price.widths,
          heights: spec.price.heights,
          matrix: spec.price.matrix,
        })
      } else {
        formula = spec.price.formula
        value = spec.price.value
      }
      const id = await insertCharacteristic(tx, {
        productFamilyId: familyId,
        parentId: spec.parentId,
        name: spec.name,
        formula,
        value,
        pricingMatrixId,
        minValue: spec.minValue ?? null,
        discountPct: spec.discountPct ?? null,
        markupPct: spec.markupPct ?? null,
        installationHoursPerUnit: spec.installationHoursPerUnit ?? null,
        sortOrder: await nextCharacteristicSortOrder(tx, familyId, spec.parentId),
      })
      return getCharacteristicInFamily(tx, familyId, id)
    },
  )
}

/** Deletes a characteristic. Deleting a main characteristic also deletes its options. */
export const deleteCharacteristic = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  characteristicId: string,
): Promise<void> => {
  await editFamilyCatalog<CharacteristicRow>(
    ctx,
    actor,
    familyId,
    (row) => ({ action: 'product_family.characteristic_delete', itemType: 'characteristic', changed: [], name: row.name }),
    async (tx) => {
      const tree = await listCharacteristicWithOptions(tx, familyId, characteristicId)
      if (!tree) return null
      const matrixIds = tree.flatMap((row) => (row.pricingMatrixId ? [row.pricingMatrixId] : []))
      const deleted = await deleteCharacteristicQuery(tx, familyId, characteristicId)
      if (!deleted) return null
      for (const matrixId of matrixIds) await deletePricingMatrixIfUnused(tx, familyId, matrixId)
      return tree[0]
    },
  )
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** Stores an uploaded image on the family. PNG, JPEG, GIF, WebP or BMP, at most 8 MB. */
export const addProductFamilyImage = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  file: { buffer: Buffer; originalName: string; title?: string | null },
): Promise<ProductFamilyImageRow> => {
  const extension = extname(file.originalName).toLowerCase()
  if (!IMAGE_EXTENSIONS.has(extension)) {
    throw new ProductFamilyValidationError('Image must be a PNG, JPEG, GIF, WebP or BMP file')
  }
  if (file.buffer.length === 0 || file.buffer.length > MAX_IMAGE_BYTES) {
    throw new ProductFamilyValidationError('Image must be under 8 MB')
  }
  const title = file.title?.trim() ? file.title.trim().slice(0, 200) : null
  const localPath = await saveLocalFile('product-family-images', file.buffer, extension)
  try {
    return await editFamilyCatalog(
      ctx,
      actor,
      familyId,
      (image) => ({ action: 'product_family.image_create', itemType: 'image', changed: [], name: image.title }),
      async (tx) => {
        const id = await insertProductFamilyImage(tx, {
          productFamilyId: familyId,
          localPath,
          title,
          sortOrder: await nextProductFamilyImageSortOrder(tx, familyId),
        })
        return getProductFamilyImageInFamily(tx, familyId, id)
      },
    )
  } catch (error) {
    await unlink(localPath).catch(() => undefined)
    throw error
  }
}

/** Sets or clears an image's title. */
export const updateProductFamilyImage = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  imageId: string,
  input: unknown,
): Promise<ProductFamilyImageRow> => {
  const parsed = updateProductFamilyImageRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new ProductFamilyValidationError(parsed.error.issues[0]?.message ?? 'Invalid request body')
  }
  return editFamilyCatalog(
    ctx,
    actor,
    familyId,
    (image) => ({ action: 'product_family.image_update', itemType: 'image', changed: ['title'], name: image.title }),
    (tx) => updateProductFamilyImageTitle(tx, familyId, imageId, parsed.data.title),
  )
}

/** Removes an image. The file is deleted when no other family (a copy) still uses that path. */
export const deleteProductFamilyImage = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  imageId: string,
): Promise<void> => {
  let pathToRemove: string | null = null
  await editFamilyCatalog<ProductFamilyImageRow>(
    ctx,
    actor,
    familyId,
    (image) => ({ action: 'product_family.image_delete', itemType: 'image', changed: [], name: image.title }),
    async (tx) => {
      const deleted = await deleteProductFamilyImageQuery(tx, familyId, imageId)
      if (!deleted) return null
      if ((await countProductFamilyImagesAtPath(tx, deleted.localPath)) === 0) pathToRemove = deleted.localPath
      return deleted
    },
  )
  if (pathToRemove) await unlink(pathToRemove).catch(() => undefined)
}

/**
 * Marks or clears this company's favorite on one family version. A company can favorite a
 * version it can see, including one shared with it. Other versions of the chain stay as they are.
 */
export const setProductFamilyFavorite = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  favorite: boolean,
): Promise<{ isFavorite: boolean }> =>
  withTenantDb(ctx, async (tx) => {
    const family = await getProductFamilyById(tx, familyId)
    if (!family) throw new Error('Product family not found')
    await setProductFamilyFavoriteQuery(tx, { companyId: ctx.effectiveCompanyId, familyId, favorite })
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: favorite ? 'product_family.favorite' : 'product_family.unfavorite',
      resourceType: 'product_family',
      resourceId: familyId,
      metadata: { version: family.version },
    })
    return { isFavorite: favorite }
  })

/**
 * Soft-deletes or restores one family version. Only a company admin (or super admin) of the
 * owning company. Other versions of the chain stay as they are.
 */
export const setProductFamilyArchived = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
  archived: boolean,
): Promise<{ archivedAt: string | null }> =>
  withTenantDb(ctx, async (tx) => {
    if (!(await userMayArchive(tx, actor.actorUserId))) {
      throw new ProductFamilyForbiddenError('Only a company admin can archive a product family')
    }
    const family = await getProductFamilyById(tx, familyId)
    if (!family) {
      throw new Error('Product family not found')
    }
    if (!canManageProductFamily(ctx, family)) {
      throw new ProductFamilyForbiddenError('Only the owning company can archive this product family')
    }
    const archivedAt = archived ? new Date() : null
    const updated = await setProductFamilyArchivedAt(tx, familyId, archivedAt)
    if (!updated) {
      throw new Error('Product family not found')
    }
    await recordAuditEvent(tx, auditActor(actor), ctx.effectiveCompanyId, {
      action: archived ? 'product_family.archive' : 'product_family.restore',
      resourceType: 'product_family',
      resourceId: familyId,
    })
    return { archivedAt: archivedAt?.toISOString() ?? null }
  })

/** The owning company or a super-admin: who may see a family's history, upload a new version and change its price validity (the detail response's `canViewHistory` / `canManage`). */
export const canManageProductFamily = (ctx: TenantContext, family: { supplierCompanyId: string }): boolean =>
  ctx.isSuperAdmin || family.supplierCompanyId === ctx.effectiveCompanyId

/**
 * A product family's change history, newest first — only for the owning company
 * (and super-admins): the entries are filed under the owner, and a company the
 * family was shared with has no business seeing who edited the owner's catalog.
 * Returns null when the family doesn't exist or isn't visible.
 * @throws {ProductFamilyHistoryForbiddenError} visible (shared) but not owned by the caller
 * @throws {InvalidAuditCursorError} `query.cursor` was not produced by this API
 */
export const getProductFamilyHistory = (
  ctx: TenantContext,
  familyId: string,
  query: RecordHistoryQuery,
): Promise<AuditLogListResponse | null> =>
  withTenantDb(ctx, async (tx) => {
    const family = await getProductFamilyById(tx, familyId)
    if (!family) {
      return null
    }
    if (!canManageProductFamily(ctx, family)) {
      throw new ProductFamilyHistoryForbiddenError('Only the owning company can see this family\'s history')
    }
    return listAuditPage(tx, { productFamilyId: familyId }, query.cursor, query.limit, toHistoryEntry)
  })
