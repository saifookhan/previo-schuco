import {
  deleteProductFamily as deleteProductFamilyQuery,
  getProductFamilyById,
  touchProductFamily,
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
  listProductFamilyVersionsOfChains,
  listVisibleProductFamilies,
  isFamilySharedWith,
  isProductFamilyInLibrary,
  setProductFamilyHasPriceList,
  setProductFamilyInLibrary,
  setProductFamilyPriceValidity,
  setProductFamilyPublished,
  setProductFamilyReadyForInvoicing,
  type CharacteristicRow,
  type PricingMatrixRow,
  type ProductFamilyDetail,
  type ProductFamilyListItem,
  type ProductFamilySummary,
  type ProductLineRow,
} from '@schuco/db'
import {
  FAMILY_DIFF_VERSION,
  countFamilyChanges,
  diffFamilyVersions,
  type FamilyChangeNode,
  type AuditLogListResponse,
  type DuplicateProductFamilyRequest,
  type FamilyVersionComparison,
  type FamilyVersionSummary,
  type FamilyVersionsResponse,
  type PriceValidityRequest,
  type ProductFamilyImportPreview,
  type ProductFamilyImportWarning,
  type RecordHistoryQuery,
} from '@schuco/contracts'

import type { FamilyVersionNote } from '../lib/quote-pdf'
import { isUuid } from '../lib/uuid'
import { extractEmbeddedImages } from '../lib/excel-import/extract-embedded-images'
import { parseProductFamilyWorkbook, type ParsedWorkbook } from '../lib/excel-import'
import { resolvePriceListType } from '../lib/excel-import/price-list-types'
import type { RawPricingMatrix } from '../lib/excel-import/types'
import {
  ProductFamilyLockedError,
  ProductFamilyNotFoundError,
  isProductFamilyEditable,
  validateCharacteristicPatch,
  validateLinePatch,
  validateMatrixInput,
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
  { includeOutOfLibrary = true }: { includeOutOfLibrary?: boolean } = {},
): Promise<ProductFamilyListItem[]> => {
  const families = await withTenantDb(ctx, (tx) => listVisibleProductFamilies(tx, ctx.effectiveCompanyId))
  return includeOutOfLibrary ? families : families.filter((family) => family.inLibrary)
}

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
 * For the quote PDF: each family's version and the changes since the version before it in its
 * chain, as the caller sees the chain (a client stepping over a draft compares with the version
 * before that). Families the caller can't see are left out.
 */
export const getFamilyVersionNotes = (ctx: TenantContext, familyIds: string[]): Promise<Map<string, FamilyVersionNote>> => {
  const ids = [...new Set(familyIds.filter(isUuid))]
  if (!ids.length) return Promise.resolve(new Map())
  return withTenantDb(ctx, async (tx) => {
    const notes = new Map<string, FamilyVersionNote>()
    // Every family's chain and stored change lists in one query each; each family loaded at most once.
    const chains = await listProductFamilyVersionsOfChains(tx, ids)
    const stored = await listStoredFamilyChanges(tx, ids)
    const loaded: ProductFamilyDetail[] = []
    for (const familyId of ids) {
      const chain = chains.get(familyId) ?? []
      const index = chain.findIndex((v) => v.id === familyId)
      if (index < 0) continue
      const previous = chain[index - 1]
      const changes = previous ? await familyChanges(tx, previous.id, familyId, { stored, loaded }) : null
      notes.set(familyId, {
        version: chain[index].version,
        previousVersion: changes ? previous.version : null,
        changes: changes ?? [],
      })
    }
    return notes
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
    const updated = before ? await setProductFamilyPriceValidity(tx, familyId, validity) : null
    if (!before || !updated) {
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

/**
 * Edits a product line's pricing fields (value, formula, discount, markup,
 * installation hours) — only the fields present in `input` change.
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
    (tx) => updateProductLineQuery(tx, familyId, lineId, patch),
  )
}

/**
 * Edits a sub-characteristic's price (value / formula). Top-level
 * characteristics have no price, so they're reported as not found.
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
    (tx) => updateCharacteristicQuery(tx, familyId, characteristicId, patch),
  )
}

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
