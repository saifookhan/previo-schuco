'use client'

import { Grid3x3, X } from 'lucide-react'
import { useState } from 'react'

import type { PricingMatrix } from '@/types/product-family'

interface ProductFamilyMatrixPreviewProps {
  matrix: PricingMatrix
  label: string
}

/** Button that opens a modal showing the full width × height pricing matrix. */
export const ProductFamilyMatrixPreview = ({ matrix, label }: ProductFamilyMatrixPreviewProps) => {
  const [open, setOpen] = useState(false)

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
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-2xl overflow-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{label}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-400">H \ B</th>
                    {matrix.widths.map((width) => (
                      <th key={width} className="border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600">
                        {width}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.heights.map((height, rowIndex) => (
                    <tr key={height}>
                      <th className="border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-600">
                        {height}
                      </th>
                      {matrix.matrix[rowIndex]?.map((value, colIndex) => (
                        <td
                          key={colIndex}
                          className="border border-slate-200 px-2 py-1 text-right tabular-nums text-slate-700"
                        >
                          {value == null || Number.isNaN(value) ? '—' : value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
