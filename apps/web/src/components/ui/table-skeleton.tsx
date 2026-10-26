import { cn } from '@/lib/utils'

/**
 * Placeholder shown while a page's table loads for the first time — rendered by the route's
 * `loading.tsx` (ADR 0014). Shapes only; `label` is read out by screen readers.
 */

type Tone = 'light' | 'dark'

const bar = (tone: Tone) => cn('animate-pulse rounded', tone === 'dark' ? 'bg-slate-800' : 'bg-slate-200')

/** Widths cycle per column so the rows don't look like a grid of identical blocks. */
const CELL_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-5/12', 'w-1/2']

export const TableSkeleton = ({
  columns,
  rows = 6,
  tone = 'light',
  label,
}: {
  columns: number
  rows?: number
  tone?: Tone
  /** Announced to screen readers; pass it when the skeleton is used on its own (not inside `PageSkeleton`). */
  label?: string
}) => (
  <div
    className={cn('overflow-hidden rounded-xl border shadow-sm', tone === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white')}
    {...(label ? { role: 'status', 'aria-busy': true } : {})}
  >
    {label ? <span className="sr-only">{label}</span> : null}
    <div className={cn('border-b px-6 py-4', tone === 'dark' ? 'border-slate-800' : 'border-slate-100')}>
      <div className={cn(bar(tone), 'h-5 w-32')} />
    </div>
    <table className="w-full text-sm" aria-hidden="true">
      <thead>
        <tr className={cn('border-b', tone === 'dark' ? 'border-slate-800' : 'border-slate-100')}>
          {Array.from({ length: columns }, (_, column) => (
            <th key={column} className="px-6 py-3">
              <div className={cn(bar(tone), 'h-3 w-16')} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row} className={cn('border-b', tone === 'dark' ? 'border-slate-800/50' : 'border-slate-50')}>
            {Array.from({ length: columns }, (_, column) => (
              <td key={column} className="px-6 py-4">
                <div className={cn(bar(tone), 'h-4', CELL_WIDTHS[(row + column) % CELL_WIDTHS.length])} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

/** A whole list page while it loads: title, optional tabs/filters, then the table. */
export const PageSkeleton = ({
  label,
  columns,
  rows,
  tone = 'light',
  tabs = false,
  filters = false,
  action = false,
}: {
  label: string
  columns: number
  rows?: number
  tone?: Tone
  tabs?: boolean
  filters?: boolean
  /** A button next to the title (e.g. "Add user"). */
  action?: boolean
}) => (
  <div className="p-6 md:p-8" role="status" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div className="mb-6 flex items-center justify-between gap-4" aria-hidden="true">
      <div className="space-y-2">
        <div className={cn(bar(tone), 'h-7 w-48')} />
        <div className={cn(bar(tone), 'h-4 w-72 max-w-full')} />
      </div>
      {action ? <div className={cn(bar(tone), 'h-10 w-36 rounded-lg')} /> : null}
    </div>
    {tabs ? (
      <div className="mb-4 flex gap-4">
        <div className={cn(bar(tone), 'h-8 w-28')} />
        <div className={cn(bar(tone), 'h-8 w-32')} />
      </div>
    ) : null}
    {filters ? <div className={cn(bar(tone), 'mb-4 h-28 w-full rounded-xl')} /> : null}
    <TableSkeleton columns={columns} rows={rows} tone={tone} />
  </div>
)
