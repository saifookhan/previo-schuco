import type { DashboardResponse } from '@schuco/contracts'

const STATUSES = ['draft', 'invoiced', 'accepted'] as const

const FILL = {
  draft: '#94a3b8',
  invoiced: '#f59e0b',
  accepted: '#10b981',
} as const

type Point = DashboardResponse['overTime']['points'][number]

const formatDay = (ymd: string, locale: string, withYear: boolean) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, {
    day: withYear ? 'numeric' : 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  })

/**
 * Stacked bars of quotes created in each bucket, drawn as SVG.
 * The repo has d3-shape only for the family-change tree, not a chart library;
 * a bar chart does not need one. Bar height is the count, so a €0 draft still shows.
 */
export const QuotesOverTimeChart = ({
  points,
  bucket,
  locale,
  statusLabels,
}: {
  points: Point[]
  bucket: 'week' | 'month'
  locale: string
  statusLabels: Record<(typeof STATUSES)[number], string>
}) => {
  const totals = points.map((point) => STATUSES.reduce((sum, status) => sum + point.byStatus[status].count, 0))
  const max = Math.max(...totals, 1)
  const width = 720
  const height = 200
  const pad = { top: 12, right: 8, bottom: 36, left: 8 }
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const gap = points.length > 8 ? 6 : 10
  const barWidth = (innerWidth - gap * Math.max(points.length - 1, 0)) / Math.max(points.length, 1)

  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
        {points.map((point, index) => {
          let cursor = pad.top + innerHeight
          const x = pad.left + index * (barWidth + gap)
          const label = bucket === 'month' ? formatDay(point.start, locale, true) : formatDay(point.start, locale, false)
          return (
            <g key={point.start}>
              {STATUSES.map((status) => {
                const count = point.byStatus[status].count
                const barHeight = (count / max) * innerHeight
                cursor -= barHeight
                if (barHeight <= 0) return null
                return (
                  <rect
                    key={status}
                    x={x}
                    y={cursor}
                    width={barWidth}
                    height={barHeight}
                    fill={FILL[status]}
                    rx={2}
                  >
                    <title>{`${label} · ${statusLabels[status]} · ${count} · ${point.byStatus[status].total}`}</title>
                  </rect>
                )
              })}
              <text x={x + barWidth / 2} y={height - 16} textAnchor="middle" className="fill-slate-500" fontSize={10}>
                {label}
              </text>
              <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" className="fill-slate-400" fontSize={10}>
                {totals[index]}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {STATUSES.map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: FILL[status] }} />
            {statusLabels[status]}
          </span>
        ))}
      </div>
    </div>
  )
}
