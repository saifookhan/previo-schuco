/** The first three slots print with the family. The rest print at the end of the preventivo. */
export const MANAGED_IMAGE_SLOT_COUNT = 3

/** A family holds at most ten pictures: three managed, seven extra. */
export const MAX_PRODUCT_FAMILY_IMAGES = 10

/** Used when the workbook has no `Titolo_immagine_N` for a managed slot. */
export const DEFAULT_MANAGED_IMAGE_TITLES = ['Generale', 'Dettaglio', 'Sezione'] as const

export interface ImageSlotPlan {
  title: string | null
  sortOrder: number
  /** Index into the embedded-images array, or null when this slot has no file from the workbook. */
  embeddedIndex: number | null
}

/**
 * Slots created with a family. Always the three managed ones, then any further
 * slot that has a title or an embedded image, capped at ten. Embedded images
 * fill slots in order.
 * @param titles - `Titolo_immagine_1` … `Titolo_immagine_10`, missing entries undefined
 * @param embeddedCount - Pictures embedded on the Product Family sheet, in row order
 */
export const planImageSlots = (titles: readonly (string | undefined)[], embeddedCount: number): ImageSlotPlan[] => {
  const titled = titles.slice(0, MAX_PRODUCT_FAMILY_IMAGES).map((title) => title?.trim() || undefined)
  let last = MANAGED_IMAGE_SLOT_COUNT - 1
  titled.forEach((title, index) => {
    if (title) last = Math.max(last, index)
  })
  if (embeddedCount > 0) {
    last = Math.max(last, Math.min(embeddedCount, MAX_PRODUCT_FAMILY_IMAGES) - 1)
  }
  const count = last + 1
  return Array.from({ length: count }, (_, sortOrder) => ({
    sortOrder,
    title: titled[sortOrder] ?? (sortOrder < MANAGED_IMAGE_SLOT_COUNT ? DEFAULT_MANAGED_IMAGE_TITLES[sortOrder] : null),
    embeddedIndex: sortOrder < embeddedCount ? sortOrder : null,
  }))
}
