import type { PricingMatrix } from '@/types/product-family'

/** Editor working copy: every value is a string so inputs can hold partial typing ("12.", "") without losing it. */
export interface MatrixDraft {
  widths: string[]
  heights: string[]
  cells: string[][]
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Drops non-numeric axis entries (older imports stored a phantom trailing
 * `null` width/height) together with their column/row, so the grid the
 * user sees and edits is always a clean numeric table.
 */
export const sanitizeMatrix = (
  matrix: Pick<PricingMatrix, 'widths' | 'heights' | 'matrix'>,
): { widths: number[]; heights: number[]; matrix: (number | null)[][] } => {
  const keepW = matrix.widths.map(isFiniteNumber)
  const keepH = matrix.heights.map(isFiniteNumber)
  return {
    widths: matrix.widths.filter((_, i) => keepW[i]),
    heights: matrix.heights.filter((_, i) => keepH[i]),
    matrix: matrix.matrix
      .filter((_, r) => keepH[r] !== false)
      .map((row) => row.filter((_, c) => keepW[c] !== false)),
  }
}

export const toDraft = (matrix: Pick<PricingMatrix, 'widths' | 'heights' | 'matrix'>): MatrixDraft => {
  const clean = sanitizeMatrix(matrix)
  return {
    widths: clean.widths.map(String),
    heights: clean.heights.map(String),
    cells: clean.heights.map((_, r) =>
      clean.widths.map((_, c) => {
        const v = clean.matrix[r]?.[c]
        return isFiniteNumber(v) ? String(v) : ''
      }),
    ),
  }
}

export type DraftResult =
  | { ok: true; value: { widths: number[]; heights: number[]; matrix: (number | null)[][] } }
  | { ok: false; error: 'axisEmpty' | 'axisNotNumber' | 'axisNotAscending' | 'cellNotNumber' }

const parseAxis = (axis: string[]): number[] | 'axisEmpty' | 'axisNotNumber' | 'axisNotAscending' => {
  if (axis.length === 0) return 'axisEmpty'
  const nums = axis.map((v) => (v.trim() === '' ? NaN : Number(v)))
  if (nums.some((n) => !Number.isFinite(n))) return 'axisNotNumber'
  if (nums.some((n, i) => i > 0 && n <= nums[i - 1])) return 'axisNotAscending'
  return nums
}

/** Converts the editor draft to the API payload; blank cell -> null ("no price"). Returns which rule failed instead of throwing, so the UI can show a translated message. */
export const fromDraft = (draft: MatrixDraft): DraftResult => {
  const widths = parseAxis(draft.widths)
  if (typeof widths === 'string') return { ok: false, error: widths }
  const heights = parseAxis(draft.heights)
  if (typeof heights === 'string') return { ok: false, error: heights }

  const matrix: (number | null)[][] = []
  for (const row of draft.cells) {
    const out: (number | null)[] = []
    for (const cell of row) {
      if (cell.trim() === '') {
        out.push(null)
        continue
      }
      const n = Number(cell)
      if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'cellNotNumber' }
      out.push(n)
    }
    matrix.push(out)
  }
  return { ok: true, value: { widths, heights, matrix } }
}
