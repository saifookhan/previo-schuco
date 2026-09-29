'use client'

import { Grid3x3, Loader2, Pencil, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { hasMinimumRole, useAuth } from '@/hooks/use-auth'
import { useRouter } from '@/i18n/navigation'
import { fromDraft, sanitizeMatrix, toDraft, type MatrixDraft } from '@/lib/pricing-matrix'
import { showToast } from '@/lib/toast'
import type { PricingMatrix } from '@/types/product-family'

interface ProductFamilyMatrixPreviewProps {
  familyId: string
  matrix: PricingMatrix
  label: string
  /** Server-side verdict (edit policy); role is checked here too. Omit/false = read-only. */
  editable?: boolean
}

const cellInput =
  'min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-right text-xs tabular-nums text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand'
const axisInput = `${cellInput} bg-slate-50 font-medium`

/**
 * Button that opens a modal with the full width x height pricing matrix.
 * Suppliers (super-user and up) can switch it to edit mode: change any
 * cell (blank = no price), edit the width/height axes, add or remove
 * rows/columns, then save. Axis order/format and cell values are
 * validated on the API too; this only mirrors those rules for fast feedback.
 */
export const ProductFamilyMatrixPreview = ({
  familyId,
  matrix,
  label,
  editable = false,
}: ProductFamilyMatrixPreviewProps) => {
  const t = useTranslations('productFamilyEdit')
  const router = useRouter()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<MatrixDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canEdit = editable && !!user && hasMinimumRole(user.role.id, 'super-user')
  const clean = sanitizeMatrix(matrix)

  const close = () => {
    setOpen(false)
    setDraft(null)
    setError(null)
  }

  const startEdit = () => {
    setDraft(toDraft(matrix))
    setError(null)
  }

  const update = (fn: (d: MatrixDraft) => MatrixDraft) => setDraft((d) => (d ? fn(d) : d))

  const setWidth = (c: number, v: string) =>
    update((d) => ({ ...d, widths: d.widths.map((w, i) => (i === c ? v : w)) }))
  const setHeight = (r: number, v: string) =>
    update((d) => ({ ...d, heights: d.heights.map((h, i) => (i === r ? v : h)) }))
  const setCell = (r: number, c: number, v: string) =>
    update((d) => ({ ...d, cells: d.cells.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) }))

  const addColumn = () =>
    update((d) => {
      const last = Number(d.widths[d.widths.length - 1])
      return {
        ...d,
        widths: [...d.widths, Number.isFinite(last) ? String(last + 200) : ''],
        cells: d.cells.map((row) => [...row, '']),
      }
    })
  const addRow = () =>
    update((d) => {
      const last = Number(d.heights[d.heights.length - 1])
      return {
        ...d,
        heights: [...d.heights, Number.isFinite(last) ? String(last + 200) : ''],
        cells: [...d.cells, d.widths.map(() => '')],
      }
    })
  const removeColumn = (c: number) =>
    update((d) => ({ ...d, widths: d.widths.filter((_, i) => i !== c), cells: d.cells.map((row) => row.filter((_, i) => i !== c)) }))
  const removeRow = (r: number) =>
    update((d) => ({ ...d, heights: d.heights.filter((_, i) => i !== r), cells: d.cells.filter((_, i) => i !== r) }))

  const save = async () => {
    if (!draft) return
    const parsed = fromDraft(draft)
    if (!parsed.ok) {
      setError(t(`matrixError.${parsed.error}`))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/product-families/${familyId}/matrices/${matrix.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.value),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        setError(data.error ? `${t('saveFailed')}: ${data.error}` : t('saveFailed'))
        return
      }
      showToast(t('matrixSaved'))
      setDraft(null)
      router.refresh()
    } catch {
      setError(t('saveFailedUnreachable'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-slate-600 underline decoration-dotted underline-offset-2 hover:text-brand"
      >
        <Grid3x3 className="h-3.5 w-3.5" /> {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6" onClick={close}>
          <div
            className="max-h-full w-full max-w-4xl overflow-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{label}</p>
              <div className="flex items-center gap-2">
                {canEdit && !draft ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5" /> {t('edit')}
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                  aria-label={t('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {draft ? (
              <>
                <p className="mb-2 text-xs text-slate-500">{t('matrixHint')}</p>
                <div className="max-h-[65vh] overflow-auto">
                  <table className="table-fixed border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="sticky left-0 top-0 z-20 w-28 border border-slate-200 bg-slate-50 px-2 py-1 text-slate-400">
                          H \ B
                        </th>
                        {draft.widths.map((w, c) => (
                          <th key={c} className="sticky top-0 z-10 w-28 border border-slate-200 bg-slate-50 p-1">
                            <div className="flex items-center gap-1">
                              <input
                                className={axisInput}
                                inputMode="decimal"
                                value={w}
                                aria-label={t('widthN', { n: c + 1 })}
                                onChange={(e) => setWidth(c, e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => removeColumn(c)}
                                disabled={draft.widths.length <= 1}
                                className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                                aria-label={t('removeColumn')}
                                title={t('removeColumn')}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </th>
                        ))}
                        <th className="sticky top-0 z-10 w-32 border-0 bg-white p-1 align-middle">
                          <button
                            type="button"
                            onClick={addColumn}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-slate-500 hover:bg-slate-100 hover:text-brand"
                          >
                            <Plus className="h-3 w-3" /> {t('addColumn')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.heights.map((h, r) => (
                        <tr key={r}>
                          <th className="sticky left-0 z-10 w-28 border border-slate-200 bg-slate-50 p-1">
                            <div className="flex items-center gap-1">
                              <input
                                className={axisInput}
                                inputMode="decimal"
                                value={h}
                                aria-label={t('heightN', { n: r + 1 })}
                                onChange={(e) => setHeight(r, e.target.value)}
                              />
                              <button
                                type="button"
                                onClick={() => removeRow(r)}
                                disabled={draft.heights.length <= 1}
                                className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                                aria-label={t('removeRow')}
                                title={t('removeRow')}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </th>
                          {draft.cells[r].map((cell, c) => (
                            <td key={c} className="w-28 border border-slate-200 p-1">
                              <div className="flex">
                                <input
                                  className={cellInput}
                                  inputMode="decimal"
                                  value={cell}
                                  placeholder="—"
                                  aria-label={t('cellRC', { row: r + 1, column: c + 1 })}
                                  onChange={(e) => setCell(r, c, e.target.value)}
                                />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <td className="border-0 p-1">
                          <button
                            type="button"
                            onClick={addRow}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-brand"
                          >
                            <Plus className="h-3 w-3" /> {t('addRow')}
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>
                    {t('cancel')}
                  </Button>
                  <Button type="button" disabled={saving} className="gap-2" onClick={() => void save()}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {saving ? t('saving') : t('save')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <table className="table-fixed border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 top-0 z-20 w-16 border border-slate-200 bg-slate-50 px-2 py-1 text-slate-400">
                        H \ B
                      </th>
                      {clean.widths.map((width, c) => (
                        <th
                          key={c}
                          className="sticky top-0 z-10 w-16 border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600"
                        >
                          {width}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clean.heights.map((height, r) => (
                      <tr key={r}>
                        <th className="sticky left-0 z-10 w-16 border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600">
                          {height}
                        </th>
                        {clean.matrix[r]?.map((value, c) => (
                          <td key={c} className="w-16 border border-slate-200 px-2 py-1 text-right tabular-nums text-slate-700">
                            {value == null || Number.isNaN(value) ? '—' : value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
