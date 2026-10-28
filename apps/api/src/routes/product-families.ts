import { readFile } from 'node:fs/promises'

import {
  duplicateProductFamilyRequestSchema,
  familySharesResponseSchema,
  priceValidityRequestSchema,
  productFamilyImportFieldsSchema,
  updateFamilySharesRequestSchema,
  type ProductFamilyImportFields,
} from '@schuco/contracts'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'

import {
  FamilyShareNotFoundError,
  FamilyShareValidationError,
  getFamilyShareDiscount,
  getFamilyShares,
  updateFamilyShares,
} from '../services/family-shares-service'
import {
  ExcelImportError,
  ProductFamilyHistoryForbiddenError,
  createNewVersionFromExcel,
  deleteProductFamily,
  duplicateProductFamily,
  getProductFamilyDetail,
  canManageProductFamily,
  getProductFamilyHistory,
  importProductFamilyFromExcel,
  listProductFamilies,
  previewProductFamilyImport,
  setProductFamilyPriceValidityDates,
  setProductFamilyPublishedStatus,
  updateCharacteristic,
  updatePricingMatrix,
  updateProductLine,
  type ProductFamilyActor,
} from '../services/product-families-service'
import {
  ProductFamilyLockedError,
  ProductFamilyNotFoundError,
  ProductFamilyValidationError,
  isProductFamilyEditable,
} from '../lib/product-family-edit'
import { isUuid, rejectNonUuidParams } from '../lib/uuid'
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requirePermission } from '../middleware/auth'
import { respondWithRecordHistory } from './record-history'

/** Product family catalog: import from Excel, list/detail, duplicate, publish toggle (Phase 2). */
export const productFamilies = new Hono<{ Variables: AuthVariables }>()

/** 400 when the body is not multipart. Registered ahead of auth so a missing file is not a 500. */
const rejectUnlessMultipart = async (c: Context, next: Next): Promise<Response | void> => {
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return c.json({ error: 'Expected multipart form data with a "file" field' }, 400)
  }
  await next()
}

const parseMultipartBody = async (c: Context): Promise<Record<string, unknown> | Response> => {
  try {
    return await c.req.parseBody()
  } catch {
    return c.json({ error: 'Could not read multipart form data' }, 400)
  }
}

const actorFrom = (c: Context<{ Variables: AuthVariables }>): ProductFamilyActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

type UploadedWorkbook = { buffer: Buffer; originalName: string }

/** The multipart `file` part, or null when it is missing. */
const readWorkbookUpload = async (body: Record<string, unknown>): Promise<UploadedWorkbook | null> => {
  const file = body.file
  if (!(file instanceof File)) {
    return null
  }
  return { buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name }
}

const MISSING_FILE = { error: 'Missing "file" in multipart form data' }

/**
 * Checks an uploaded workbook in memory and says what it holds, so the
 * upload dialog can show it before anything is saved. Writes nothing.
 */
productFamilies.post('/import/preview', rejectUnlessMultipart, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const body = await parseMultipartBody(c)
  if (body instanceof Response) return body
  const upload = await readWorkbookUpload(body)
  if (!upload) {
    return c.json(MISSING_FILE, 400)
  }
  try {
    return c.json(await previewProductFamilyImport(upload))
  } catch (error) {
    if (error instanceof ExcelImportError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})

/**
 * Reads what both "save upload" routes take: the workbook, plus the fields
 * the user confirmed in the upload dialog (validity dates, name, publish).
 */
const readImportRequest = async (
  c: Context<{ Variables: AuthVariables }>,
): Promise<{ upload: UploadedWorkbook; fields: ProductFamilyImportFields } | Response> => {
  const body = await parseMultipartBody(c)
  if (body instanceof Response) return body
  const upload = await readWorkbookUpload(body)
  if (!upload) {
    return c.json(MISSING_FILE, 400)
  }
  const fields = productFamilyImportFieldsSchema.safeParse(body)
  if (!fields.success) {
    return c.json({ error: fields.error.issues[0]?.message ?? 'Invalid request body', details: fields.error.issues }, 400)
  }
  return { upload, fields: fields.data }
}

/**
 * Imports a product family from an uploaded Excel workbook, into the
 * caller's own company (ADR 0001 — never a path/body-supplied company).
 * Only a company-admin/super-user manages their own catalog; a client
 * company never imports into a supplier's.
 */
productFamilies.post('/import', rejectUnlessMultipart, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const request = await readImportRequest(c)
  if (request instanceof Response) {
    return request
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }

  try {
    const family = await importProductFamilyFromExcel(ctx, actorFrom(c), ctx.effectiveCompanyId, request.upload, request.fields)
    return c.json({ family }, 201)
  } catch (error) {
    if (error instanceof ExcelImportError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})

/**
 * Re-imports an updated Excel workbook as a new version of an existing
 * family (`version + 1`, `supersedesId` set) — the existing version is
 * left untouched, published or not, and keeps its own validity dates.
 */
productFamilies.post(
  '/:id/new-version',
  rejectNonUuidParams,
  rejectUnlessMultipart,
  requireAuth,
  requirePermission('catalog.edit'),
  async (c) => {
    const id = c.req.param('id')
    if (!id) {
      return c.json({ error: 'Missing id' }, 400)
    }

    const request = await readImportRequest(c)
    if (request instanceof Response) {
      return request
    }
    const ctx = {
      effectiveCompanyId: c.get('effectiveCompanyId'),
      isSuperAdmin: c.get('isSuperAdmin'),
    }

    try {
      const family = await createNewVersionFromExcel(ctx, actorFrom(c), id, request.upload, request.fields)
      return c.json({ family }, 201)
    } catch (error) {
      if (error instanceof ExcelImportError) {
        return c.json({ error: error.message }, 400)
      }
      if (error instanceof Error && error.message === 'Product family not found') {
        return c.json({ error: error.message }, 404)
      }
      throw error
    }
  },
)

/** Changes the days the family's prices can be used on new quote positions (owner or super-admin). */
productFamilies.put('/:id/price-validity', rejectNonUuidParams, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const id = c.req.param('id') ?? ''
  if (!isUuid(id)) {
    return c.json({ error: 'Not found' }, 404)
  }
  const parsedBody = priceValidityRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsedBody.success) {
    return c.json({ error: parsedBody.error.issues[0]?.message ?? 'Invalid request body', details: parsedBody.error.issues }, 400)
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  try {
    return c.json(await setProductFamilyPriceValidityDates(ctx, actorFrom(c), id, parsedBody.data))
  } catch (error) {
    if (error instanceof ProductFamilyNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})

/** Lists product families visible to the caller (own company's, plus published families shared with it). */
productFamilies.get('/', requireAuth, requirePermission('catalog.view'), async (c) => {
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  const families = await listProductFamilies(ctx)
  return c.json({ families })
})

/** Full detail (lines, characteristics, matrices, relations, images) for one family. */
productFamilies.get('/:id', rejectNonUuidParams, requireAuth, requirePermission('catalog.view'), async (c) => {
  const id = c.req.param('id')
  if (!id || !isUuid(id)) {
    return c.json({ error: 'Not found' }, 404)
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  const detail = await getProductFamilyDetail(ctx, id)
  if (!detail) {
    return c.json({ error: 'Not found' }, 404)
  }
  const shareDiscountPct = await getFamilyShareDiscount(ctx, id)
  const ownsFamily = canManageProductFamily(ctx, detail.family)
  return c.json({
    ...detail,
    editable: isProductFamilyEditable(detail.family),
    shareDiscountPct,
    canViewHistory: ownsFamily,
    canManage: ownsFamily,
  })
})

/** The family's change history (import, publish, versions, price edits, sharing) — owning company and super-admin only. */
productFamilies.get('/:id/history', rejectNonUuidParams, requireAuth, requirePermission('catalog.view'), (c) =>
  respondWithRecordHistory(
    c,
    (id, query) => getProductFamilyHistory({ effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') }, id, query),
    [ProductFamilyHistoryForbiddenError],
  ),
)

/** The companies the caller's company shares this family with (plus the companies it could add). */
productFamilies.get('/:id/shares', rejectNonUuidParams, requireAuth, requirePermission('catalog.share'), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  try {
    const result = await getFamilyShares(
      { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') },
      id,
    )
    return c.json(familySharesResponseSchema.parse(result))
  } catch (error) {
    if (error instanceof FamilyShareNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})

/** Replaces the set of companies the caller's company shares this family with, each at a default discount. */
productFamilies.put('/:id/shares', rejectNonUuidParams, requireAuth, requirePermission('catalog.share'), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const parsedBody = updateFamilySharesRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsedBody.success) {
    return c.json({ error: 'Invalid request body', details: parsedBody.error.issues }, 400)
  }
  try {
    const result = await updateFamilyShares(
      { effectiveCompanyId: c.get('effectiveCompanyId'), isSuperAdmin: c.get('isSuperAdmin') },
      {
        actorUserId: c.get('actorUserId'),
        actorCompanyId: c.get('user').company.id,
        requestId: c.get('requestId'),
      },
      id,
      parsedBody.data.shares,
    )
    return c.json(familySharesResponseSchema.parse(result))
  } catch (error) {
    if (error instanceof FamilyShareNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    if (error instanceof FamilyShareValidationError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
}

/** Streams one embedded image — RLS-scoped the same way the rest of the family's detail is (via getProductFamilyDetail's own image list). */
productFamilies.get('/:id/images/:imageId', rejectNonUuidParams, requireAuth, requirePermission('catalog.view'), async (c) => {
  const id = c.req.param('id')
  const imageId = c.req.param('imageId')
  if (!id || !imageId) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  const detail = await getProductFamilyDetail(ctx, id)
  const image = detail?.images.find((img) => img.id === imageId)
  if (!image) {
    return c.json({ error: 'Not found' }, 404)
  }

  let buffer: Buffer
  try {
    buffer = await readFile(image.localPath)
  } catch {
    return c.json({ error: 'Image file missing on disk' }, 404)
  }
  const extension = image.localPath.split('.').pop()?.toLowerCase() ?? ''
  return c.body(new Uint8Array(buffer), 200, {
    'Content-Type': CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=3600',
  })
})

/** Deep-copies a family ("Duplicate") under the name, price validity and publish choice from the copy dialog. */
productFamilies.post('/:id/duplicate', rejectNonUuidParams, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const id = c.req.param('id') ?? ''
  if (!isUuid(id)) {
    return c.json({ error: 'Not found' }, 404)
  }
  const parsedBody = duplicateProductFamilyRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsedBody.success) {
    return c.json({ error: parsedBody.error.issues[0]?.message ?? 'Invalid request body', details: parsedBody.error.issues }, 400)
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  try {
    const family = await duplicateProductFamily(ctx, actorFrom(c), id, parsedBody.data)
    return c.json({ family }, 201)
  } catch (error) {
    if (error instanceof ProductFamilyNotFoundError) {
      return c.json({ error: error.message }, 404)
    }
    throw error
  }
})

/** Toggles client visibility ("allowing a user to see/no-see"). */
productFamilies.patch('/:id/publish', rejectNonUuidParams, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  if (typeof body?.isPublished !== 'boolean') {
    return c.json({ error: '"isPublished" (boolean) is required' }, 400)
  }

  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  try {
    await setProductFamilyPublishedStatus(ctx, actorFrom(c), id, body.isPublished)
  } catch (error) {
    return editErrorResponse(c, error)
  }
  return c.json({ ok: true })
})

/** Permanently deletes a family and everything under it (lines, characteristics, matrices, images). */
productFamilies.delete('/:id', rejectNonUuidParams, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  try {
    await deleteProductFamily(ctx, actorFrom(c), id)
  } catch {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json({ ok: true })
})

/** Maps the edit-flow errors to HTTP statuses; anything else is a real 500. */
const editErrorResponse = (c: Context<{ Variables: AuthVariables }>, error: unknown) => {
  if (error instanceof ProductFamilyValidationError) {
    return c.json({ error: error.message }, 400)
  }
  if (error instanceof ProductFamilyNotFoundError) {
    return c.json({ error: error.message }, 404)
  }
  if (error instanceof ProductFamilyLockedError) {
    return c.json({ error: error.message }, 409)
  }
  throw error
}

const editContext = (c: Context<{ Variables: AuthVariables }>) => ({
  effectiveCompanyId: c.get('effectiveCompanyId'),
  isSuperAdmin: c.get('isSuperAdmin'),
})

/** Replaces a pricing matrix's widths/heights/cells. */
productFamilies.patch('/:id/matrices/:matrixId', rejectNonUuidParams, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const id = c.req.param('id')
  const matrixId = c.req.param('matrixId')
  if (!id || !matrixId) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  try {
    const matrix = await updatePricingMatrix(editContext(c), actorFrom(c), id, matrixId, body)
    return c.json({ matrix })
  } catch (error) {
    return editErrorResponse(c, error)
  }
})

/** Edits a product line's pricing fields (value, formula, discount, markup, installation hours). */
productFamilies.patch('/:id/lines/:lineId', rejectNonUuidParams, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const id = c.req.param('id')
  const lineId = c.req.param('lineId')
  if (!id || !lineId) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  try {
    const line = await updateProductLine(editContext(c), actorFrom(c), id, lineId, body)
    return c.json({ line })
  } catch (error) {
    return editErrorResponse(c, error)
  }
})

/** Edits a sub-characteristic's price (value / formula). */
productFamilies.patch('/:id/characteristics/:characteristicId', rejectNonUuidParams, requireAuth, requirePermission('catalog.edit'), async (c) => {
  const id = c.req.param('id')
  const characteristicId = c.req.param('characteristicId')
  if (!id || !characteristicId) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const body = await c.req.json().catch(() => null)
  try {
    const characteristic = await updateCharacteristic(editContext(c), actorFrom(c), id, characteristicId, body)
    return c.json({ characteristic })
  } catch (error) {
    return editErrorResponse(c, error)
  }
})
