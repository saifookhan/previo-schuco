import { readFile } from 'node:fs/promises'

import type { Context } from 'hono'
import { Hono } from 'hono'

import {
  ExcelImportError,
  createNewVersionFromExcel,
  deleteProductFamily,
  duplicateProductFamily,
  getProductFamilyDetail,
  importProductFamilyFromExcel,
  listProductFamilies,
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
import type { AuthVariables } from '../middleware/auth'
import { requireAuth, requireRoles } from '../middleware/auth'

/** Product family catalog: import from Excel, list/detail, duplicate, publish toggle (Phase 2). */
export const productFamilies = new Hono<{ Variables: AuthVariables }>()

const actorFrom = (c: Context<{ Variables: AuthVariables }>): ProductFamilyActor => ({
  actorUserId: c.get('actorUserId'),
  actorCompanyId: c.get('user').company.id,
  requestId: c.get('requestId'),
})

/**
 * Imports a product family from an uploaded Excel workbook, into the
 * caller's own company (ADR 0001 — never a path/body-supplied company).
 * Only a company-admin/super-user manages their own catalog; a client
 * company never imports into a supplier's.
 */
productFamilies.post('/import', requireAuth, requireRoles(['company-admin', 'super-user', 'super-admin']), async (c) => {
  const body = await c.req.parseBody()
  const file = body.file
  if (!(file instanceof File)) {
    return c.json({ error: 'Missing "file" in multipart form data' }, 400)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }

  try {
    const family = await importProductFamilyFromExcel(ctx, actorFrom(c), ctx.effectiveCompanyId, {
      buffer,
      originalName: file.name,
    })
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
 * left untouched, published or not.
 */
productFamilies.post(
  '/:id/new-version',
  requireAuth,
  requireRoles(['company-admin', 'super-user', 'super-admin']),
  async (c) => {
    const id = c.req.param('id')
    if (!id) {
      return c.json({ error: 'Missing id' }, 400)
    }

    const body = await c.req.parseBody()
    const file = body.file
    if (!(file instanceof File)) {
      return c.json({ error: 'Missing "file" in multipart form data' }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ctx = {
      effectiveCompanyId: c.get('effectiveCompanyId'),
      isSuperAdmin: c.get('isSuperAdmin'),
    }

    try {
      const family = await createNewVersionFromExcel(ctx, actorFrom(c), id, {
        buffer,
        originalName: file.name,
      })
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

/** Lists product families visible to the caller (own company's, plus published families of linked suppliers). */
productFamilies.get('/', requireAuth, async (c) => {
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  const families = await listProductFamilies(ctx)
  return c.json({ families })
})

/** Full detail (lines, characteristics, matrices, relations, images) for one family. */
productFamilies.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  const detail = await getProductFamilyDetail(ctx, id)
  if (!detail) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json({ ...detail, editable: isProductFamilyEditable(detail.family) })
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
productFamilies.get('/:id/images/:imageId', requireAuth, async (c) => {
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

/** Deep-copies a family into a new, unpublished draft ("Duplicate"). */
productFamilies.post('/:id/duplicate', requireAuth, requireRoles(['company-admin', 'super-user', 'super-admin']), async (c) => {
  const id = c.req.param('id')
  if (!id) {
    return c.json({ error: 'Missing id' }, 400)
  }
  const ctx = {
    effectiveCompanyId: c.get('effectiveCompanyId'),
    isSuperAdmin: c.get('isSuperAdmin'),
  }
  const family = await duplicateProductFamily(ctx, actorFrom(c), id)
  return c.json({ family }, 201)
})

/** Toggles client visibility ("allowing a user to see/no-see"). */
productFamilies.patch('/:id/publish', requireAuth, requireRoles(['company-admin', 'super-user', 'super-admin']), async (c) => {
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
  await setProductFamilyPublishedStatus(ctx, actorFrom(c), id, body.isPublished)
  return c.json({ ok: true })
})

/** Permanently deletes a family and everything under it (lines, characteristics, matrices, images). */
productFamilies.delete('/:id', requireAuth, requireRoles(['company-admin', 'super-user', 'super-admin']), async (c) => {
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

const EDIT_ROLES = ['company-admin', 'super-user', 'super-admin'] as const

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
productFamilies.patch('/:id/matrices/:matrixId', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
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
productFamilies.patch('/:id/lines/:lineId', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
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
productFamilies.patch('/:id/characteristics/:characteristicId', requireAuth, requireRoles([...EDIT_ROLES]), async (c) => {
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
