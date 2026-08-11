import { z } from 'zod'

/** POST /upload request — initiate file upload (Phase 4). */
export const uploadRequestSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  quoteReference: z.string().optional(),
  purpose: z.enum(['attachment', 'import', 'export']),
})

export type UploadRequest = z.infer<typeof uploadRequestSchema>

/** POST /upload response with presigned URL. */
export const uploadResponseSchema = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
})

export type UploadResponse = z.infer<typeof uploadResponseSchema>

/** GET /files/:id metadata response. */
export const fileMetadataSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  quoteReference: z.string().nullable(),
  createdAt: z.string().datetime(),
  downloadUrl: z.string().url().optional(),
})

export type FileMetadata = z.infer<typeof fileMetadataSchema>

/** POST /pdf/render request. */
export const renderPdfRequestSchema = z.object({
  quoteReference: z.string().min(1),
  locale: z.enum(['it', 'en', 'de']).default('it'),
  template: z.enum(['standard', 'branded']).default('standard'),
})

export type RenderPdfRequest = z.infer<typeof renderPdfRequestSchema>

/** POST /pdf/render response. */
export const renderPdfResponseSchema = z.object({
  fileId: z.string().uuid(),
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
})

export type RenderPdfResponse = z.infer<typeof renderPdfResponseSchema>

/** POST /import/excel response. */
export const importExcelResponseSchema = z.object({
  importedRows: z.number().int().nonnegative(),
  quoteReferences: z.array(z.string()),
  warnings: z.array(z.string()),
})

export type ImportExcelResponse = z.infer<typeof importExcelResponseSchema>
