import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Local-disk file storage (deliberate, not a placeholder for S3 — AWS/S3
 * is still under discussion; this keeps import working without it, per
 * an explicit decision to defer that choice). Swappable later: every
 * caller stores only a path string (`sourceExcelPath`,
 * `productFamilyImages.localPath`), never an S3-specific shape, so
 * switching the implementation behind this file to S3 needs no schema or
 * caller change.
 *
 * Files land under `LOCAL_STORAGE_DIR` (default `<repo root>/data/uploads`,
 * gitignored) — never under `apps/api/src`, which the Docker build COPYs
 * verbatim into the image (ADR: see apps/api/Dockerfile), so uploads
 * would otherwise get baked into every subsequent image build.
 */
const storageDir = (): string => process.env.LOCAL_STORAGE_DIR ?? join(process.cwd(), '..', '..', 'data', 'uploads')

/**
 * Saves a buffer under a random filename in `subdir` (e.g. "product-family-excel",
 * "product-family-images"), returning the path to store in the DB.
 * @param subdir - Subdirectory to group related uploads
 * @param buffer - File bytes
 * @param extension - Including the dot, e.g. ".xlsx"
 */
export const saveLocalFile = async (
  subdir: string,
  buffer: Buffer,
  extension: string,
): Promise<string> => {
  const dir = join(storageDir(), subdir)
  await mkdir(dir, { recursive: true })
  const filename = `${randomUUID()}${extension}`
  const path = join(dir, filename)
  await writeFile(path, buffer)
  return path
}
