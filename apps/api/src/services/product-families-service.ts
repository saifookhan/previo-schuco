import {
  deleteProductFamily as deleteProductFamilyQuery,
  getProductFamilyById,
  touchProductFamily,
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
  listVisibleProductFamilies,
  setProductFamilyPriceValidity,
  setProductFamilyPublished,
  type CharacteristicRow,
  type PricingMatrixRow,
  type ProductFamilyDetail,
  type ProductFamilyListItem,
  type ProductFamilySummary,
  type ProductLineRow,
} from '@schuco/db'
import type {
  AuditLogListResponse,
  PriceValidityRequest,
  ProductFamilyImportPreview,
  ProductFamilyImportWarning,
  RecordHistoryQuery,
} from '@schuco/contracts'

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
 * `packages/calculation/src/product-costing.ts`'s `pct / 100`). Missing
 * -> the column's own DB default (0 discount / 100 markup, i.e. no-op).
 * @param rawFraction - The sheet's raw decimal value, or null/undefined if the cell was blank
 */
const toStoredPct = (rawFraction: number | null | undefined): string | undefined =>
  rawFraction == null ? undefined : String(rawFraction * 100)

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
        resolvePriceListType(line.priceListType)
      }
    }
    for (const main of parsed.characteristics) {
      for (const sub of main.subCharacters) {
        if (sub.priceListType && !isMatrix(sub.listinoAcquisto)) {
          resolvePriceListType(sub.priceListType)
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
  /** Makes this import a new *version* of an existing family (see `createNewVersionFromExcel`). */
  version?: { version: number; supersedesId: string }
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
      sourceExcelPath: excelPath,
      version: versionOptions?.version,
      supersedesId: versionOptions?.supersedesId,
      ...priceValidity,
      isPublished: options.publish ?? false,
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
        const resolved = resolvePriceListType(line.priceListType ?? '')
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
        unitName: line.unitName,
        unitSymbol: line.unitSymbol,
        discountPct: toStoredPct(line.discountPct) ?? '0',
        markupPct: toStoredPct(line.markupPct) ?? '100',
        installationHoursPerUnit: String(line.installationHoursPerUnit),
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
          const resolved = resolvePriceListType(sub.priceListType ?? '')
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
        ...(versionOptions ? { supersedesId: versionOptions.supersedesId, version: versionOptions.version } : {}),
      },
    })

    const detail = await getProductFamilyDetailQuery(tx, familyId)
    return detail!.family
  })

  return family
}

export const listProductFamilies = (ctx: TenantContext): Promise<ProductFamilyListItem[]> =>
  withTenantDb(ctx, (tx) => listVisibleProductFamilies(tx, ctx.effectiveCompanyId))

export const getProductFamilyDetail = (
  ctx: TenantContext,
  familyId: string,
): Promise<ProductFamilyDetail | null> => withTenantDb(ctx, (tx) => getProductFamilyDetailQuery(tx, familyId))

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

  return importProductFamilyFromExcel(ctx, actor, existing.family.supplierCompanyId, file, {
    ...options,
    version: { version: latest.version + 1, supersedesId: latest.id },
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
 * @throws if the source family doesn't exist or isn't visible to the caller
 */
export const duplicateProductFamily = async (
  ctx: TenantContext,
  actor: ProductFamilyActor,
  familyId: string,
): Promise<ProductFamilySummary> =>
  withTenantDb(ctx, async (tx) => {
    const source = await getProductFamilyDetailQuery(tx, familyId)
    if (!source) {
      throw new Error('Product family not found')
    }

    const newFamilyId = await insertProductFamily(tx, {
      supplierCompanyId: source.family.supplierCompanyId,
      name: `${source.family.name} (copy)`,
      technicalName: source.family.technicalName,
      category: source.family.category,
      brand: source.family.brand,
      description1: source.family.description1,
      description2: source.family.description2,
      priceValidFrom: source.family.priceValidFrom,
      priceValidTo: source.family.priceValidTo,
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
        metadata: { duplicatedFromId: familyId },
      },
    )

    const detail = await getProductFamilyDetailQuery(tx, newFamilyId)
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
