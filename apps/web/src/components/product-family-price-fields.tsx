'use client'

import { Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fromDraft, toDraft, type MatrixDraft } from '@/lib/pricing-matrix'
import {
  CUSTOM_PRICE_LIST_TYPE,
  MATRIX_PRICE_LIST_TYPE,
  PRICE_LIST_TYPE_FORMULAS,
} from '@schuco/contracts'

const cellInput =
  'min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-right text-xs tabular-nums text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand'
const axisInput = `${cellInput} bg-slate-50 font-medium`

/** A blank width × height table, ready for the first prices. */
export const emptyMatrixDraft = (): MatrixDraft => ({
  widths: ['800', '1000'],
  heights: ['800', '1000'],
  cells: [
    ['', ''],
    ['', ''],
  ],
})

export interface PriceFieldState {
  priceType: string
  value: string
  formula: string
  matrix: MatrixDraft
}

/** The price half of a line or option: a known price type, a custom formula, or a width × height table. */
export const ProductFamilyPriceFields = ({
  idPrefix,
  state,
  onChange,
}: {
  idPrefix: string
  state: PriceFieldState
  onChange: (next: PriceFieldState) => void
}) => {
  const t = useTranslations('productFamilyManual')
  const tEdit = useTranslations('productFamilyEdit')
  const isMatrix = state.priceType === MATRIX_PRICE_LIST_TYPE
  const isCustom = state.priceType === CUSTOM_PRICE_LIST_TYPE

  const setPriceType = (priceType: string) => {
    if (priceType === MATRIX_PRICE_LIST_TYPE || priceType === CUSTOM_PRICE_LIST_TYPE) {
      onChange({ ...state, priceType })
      return
    }
    onChange({ ...state, priceType, formula: PRICE_LIST_TYPE_FORMULAS[priceType] ?? state.formula })
  }

  const updateMatrix = (fn: (draft: MatrixDraft) => MatrixDraft) => onChange({ ...state, matrix: fn(state.matrix) })

  const setWidth = (c: number, v: string) =>
    updateMatrix((draft) => ({ ...draft, widths: draft.widths.map((width, i) => (i === c ? v : width)) }))
  const setHeight = (r: number, v: string) =>
    updateMatrix((draft) => ({ ...draft, heights: draft.heights.map((height, i) => (i === r ? v : height)) }))
  const setCell = (r: number, c: number, v: string) =>
    updateMatrix((draft) => ({
      ...draft,
      cells: draft.cells.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? v : cell)) : row)),
    }))
  const addColumn = () =>
    updateMatrix((draft) => {
      const last = Number(draft.widths[draft.widths.length - 1])
      return {
        ...draft,
        widths: [...draft.widths, Number.isFinite(last) ? String(last + 200) : ''],
        cells: draft.cells.map((row) => [...row, '']),
      }
    })
  const addRow = () =>
    updateMatrix((draft) => {
      const last = Number(draft.heights[draft.heights.length - 1])
      return {
        ...draft,
        heights: [...draft.heights, Number.isFinite(last) ? String(last + 200) : ''],
        cells: [...draft.cells, draft.widths.map(() => '')],
      }
    })
  const removeColumn = (c: number) =>
    updateMatrix((draft) => ({
      ...draft,
      widths: draft.widths.filter((_, i) => i !== c),
      cells: draft.cells.map((row) => row.filter((_, i) => i !== c)),
    }))
  const removeRow = (r: number) =>
    updateMatrix((draft) => ({
      ...draft,
      heights: draft.heights.filter((_, i) => i !== r),
      cells: draft.cells.filter((_, i) => i !== r),
    }))

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-price-type`}>{t('fieldPriceType')}</Label>
        <select
          id={`${idPrefix}-price-type`}
          className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand"
          value={state.priceType}
          onChange={(e) => setPriceType(e.target.value)}
        >
          {Object.keys(PRICE_LIST_TYPE_FORMULAS).map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
          <option value={CUSTOM_PRICE_LIST_TYPE}>{t('priceTypeCustom')}</option>
        </select>
      </div>

      {isMatrix ? (
        <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
          <p className="px-2 py-1.5 text-xs text-slate-500">{tEdit('matrixHint')}</p>
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 w-28 border border-slate-200 bg-slate-50 px-2 py-1 text-slate-400">H \ B</th>
                {state.matrix.widths.map((width, c) => (
                  <th key={c} className="sticky top-0 z-10 w-28 border border-slate-200 bg-slate-50 p-1">
                    <div className="flex items-center gap-1">
                      <input className={axisInput} inputMode="decimal" value={width} aria-label={tEdit('widthN', { n: c + 1 })} onChange={(e) => setWidth(c, e.target.value)} />
                      <button type="button" onClick={() => removeColumn(c)} disabled={state.matrix.widths.length <= 1} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={tEdit('removeColumn')}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="border-0 bg-white p-1">
                  <button type="button" onClick={addColumn} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 hover:text-brand">
                    <Plus className="h-3 w-3" /> {tEdit('addColumn')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {state.matrix.heights.map((height, r) => (
                <tr key={r}>
                  <th className="sticky left-0 z-10 w-28 border border-slate-200 bg-slate-50 p-1">
                    <div className="flex items-center gap-1">
                      <input className={axisInput} inputMode="decimal" value={height} aria-label={tEdit('heightN', { n: r + 1 })} onChange={(e) => setHeight(r, e.target.value)} />
                      <button type="button" onClick={() => removeRow(r)} disabled={state.matrix.heights.length <= 1} className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" aria-label={tEdit('removeRow')}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                  {state.matrix.cells[r]?.map((cell, c) => (
                    <td key={c} className="w-28 border border-slate-200 p-1">
                      <input className={cellInput} inputMode="decimal" value={cell} placeholder="—" aria-label={tEdit('cellRC', { row: r + 1, column: c + 1 })} onChange={(e) => setCell(r, c, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="p-1">
                  <button type="button" onClick={addRow} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-brand">
                    <Plus className="h-3 w-3" /> {tEdit('addRow')}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-value`}>{tEdit('fieldValue')}</Label>
            <Input id={`${idPrefix}-value`} inputMode="decimal" value={state.value} onChange={(e) => onChange({ ...state, value: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-formula`}>{tEdit('fieldFormula')}</Label>
            <Input
              id={`${idPrefix}-formula`}
              value={isCustom ? state.formula : (PRICE_LIST_TYPE_FORMULAS[state.priceType] ?? state.formula)}
              readOnly={!isCustom}
              onChange={(e) => onChange({ ...state, formula: e.target.value })}
              className={isCustom ? 'font-mono text-xs' : 'font-mono text-xs text-slate-500'}
            />
            <p className="text-xs text-slate-500">{tEdit('formulaHint')}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export type BuiltPrice =
  | { ok: true; price: { kind: 'formula'; formula: string; value: string } | { kind: 'matrix'; widths: number[]; heights: number[]; matrix: (number | null)[][] } }
  | { ok: false; error: string }

/** Turns the price fields into the API payload, or a translated error. */
export const buildPrice = (state: PriceFieldState, t: (key: string) => string, tEdit: (key: string) => string): BuiltPrice => {
  if (state.priceType === MATRIX_PRICE_LIST_TYPE) {
    const parsed = fromDraft(state.matrix)
    if (!parsed.ok) return { ok: false, error: tEdit(`matrixError.${parsed.error}`) }
    return { ok: true, price: { kind: 'matrix', ...parsed.value } }
  }
  if (state.value.trim() === '') return { ok: false, error: t('valueRequired') }
  const formula = state.priceType === CUSTOM_PRICE_LIST_TYPE ? state.formula.trim() : (PRICE_LIST_TYPE_FORMULAS[state.priceType] ?? '')
  if (!formula) return { ok: false, error: t('formulaRequired') }
  return { ok: true, price: { kind: 'formula', formula, value: state.value.trim() } }
}

/** Price-field state for a stored line or option. `matrix` is the family's table when this item uses one. */
export const priceStateFromItem = (
  item: { formula: string | null; value: string | null; pricingMatrixId: string | null },
  matrix: { widths: number[]; heights: number[]; matrix: (number | null)[][] } | undefined,
): PriceFieldState => {
  if (item.pricingMatrixId && matrix) {
    return { priceType: MATRIX_PRICE_LIST_TYPE, value: '', formula: item.formula ?? '', matrix: toDraft(matrix) }
  }
  const matched = Object.entries(PRICE_LIST_TYPE_FORMULAS).find(([, formula]) => formula === item.formula)
  return {
    priceType: matched?.[0] ?? CUSTOM_PRICE_LIST_TYPE,
    value: item.value == null ? '' : String(Number(item.value)),
    formula: item.formula ?? '',
    matrix: emptyMatrixDraft(),
  }
}
