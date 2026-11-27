import type { DashboardPeriod } from '@schuco/contracts'

/** Price lists and the sales week both use Italy's civil clock. */
export const DASHBOARD_TIMEZONE = 'Europe/Rome'

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

export interface Ymd {
  year: number
  month: number
  day: number
}

export interface TimeRange {
  /** Inclusive. */
  start: Date
  /** Exclusive. */
  end: Date
  startYmd: string
  /** Exclusive end as a calendar date. */
  endYmd: string
}

export const formatYmd = (ymd: Ymd): string =>
  `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`

export const addDays = (ymd: Ymd, days: number): Ymd => {
  const shifted = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days))
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
}

/** Add calendar days to a `YYYY-MM-DD` string. The date itself has no timezone. */
export const addIsoDays = (iso: string, days: number): string => {
  const [year, month, day] = iso.split('-').map(Number)
  return formatYmd(addDays({ year: year!, month: month!, day: day! }, days))
}

/** Calendar date and weekday (0 = Sunday) of `date` in Europe/Rome. */
export const romeYmd = (date: Date): Ymd & { weekday: number } => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    weekday: WEEKDAY_INDEX[value('weekday')] ?? 0,
  }
}

/**
 * UTC instant of midnight at the start of `ymd` in Europe/Rome.
 * `Intl` supplies the offset, so CET and CEST both land on the right instant.
 */
export const zonedMidnightUtc = (ymd: Ymd): Date => {
  const utcGuess = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DASHBOARD_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcGuess))
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  let year = value('year')
  let month = value('month')
  let day = value('day')
  let hour = value('hour')
  if (hour === 24) {
    hour = 0
    const next = addDays({ year, month, day }, 1)
    year = next.year
    month = next.month
    day = next.day
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, value('minute'), value('second'))
  return new Date(utcGuess - (asUtc - utcGuess))
}

/** Thursday of the Thu–Wed week that contains `date` (Europe/Rome). */
export const thursdayOf = (date: Date): Ymd => {
  const ymd = romeYmd(date)
  const sinceThursday = (ymd.weekday - 4 + 7) % 7
  return addDays(ymd, -sinceThursday)
}

/** KPI window: this Thu–Wed week, this calendar month, or this calendar year. */
export const periodRange = (period: DashboardPeriod, now: Date): TimeRange => {
  const today = romeYmd(now)
  if (period === 'week') {
    const start = thursdayOf(now)
    const end = addDays(start, 7)
    return { start: zonedMidnightUtc(start), end: zonedMidnightUtc(end), startYmd: formatYmd(start), endYmd: formatYmd(end) }
  }
  if (period === 'month') {
    const start = { year: today.year, month: today.month, day: 1 }
    const end = today.month === 12 ? { year: today.year + 1, month: 1, day: 1 } : { year: today.year, month: today.month + 1, day: 1 }
    return { start: zonedMidnightUtc(start), end: zonedMidnightUtc(end), startYmd: formatYmd(start), endYmd: formatYmd(end) }
  }
  const start = { year: today.year, month: 1, day: 1 }
  const end = { year: today.year + 1, month: 1, day: 1 }
  return { start: zonedMidnightUtc(start), end: zonedMidnightUtc(end), startYmd: formatYmd(start), endYmd: formatYmd(end) }
}

export interface ChartBucket {
  start: Date
  end: Date
  startYmd: string
  endYmd: string
}

const bucketFrom = (start: Ymd, end: Ymd): ChartBucket => ({
  start: zonedMidnightUtc(start),
  end: zonedMidnightUtc(end),
  startYmd: formatYmd(start),
  endYmd: formatYmd(end),
})

/**
 * Bars for the chart.
 * - week: the last 8 Thursday–Wednesday weeks, ending with the current one
 * - month: every Thu–Wed week that overlaps the month (quotes are still limited to the month)
 * - year: the 12 calendar months
 */
export const chartBuckets = (period: DashboardPeriod, now: Date): ChartBucket[] => {
  if (period === 'year') {
    const year = romeYmd(now).year
    return Array.from({ length: 12 }, (_, index) => {
      const start = { year, month: index + 1, day: 1 }
      const end = index === 11 ? { year: year + 1, month: 1, day: 1 } : { year, month: index + 2, day: 1 }
      return bucketFrom(start, end)
    })
  }
  if (period === 'month') {
    const range = periodRange('month', now)
    const first = thursdayOf(range.start)
    const last = thursdayOf(new Date(range.end.getTime() - 1))
    const buckets: ChartBucket[] = []
    let cursor = first
    while (formatYmd(cursor) <= formatYmd(last)) {
      const end = addDays(cursor, 7)
      buckets.push(bucketFrom(cursor, end))
      cursor = end
    }
    return buckets
  }
  const current = thursdayOf(now)
  const first = addDays(current, -7 * 7)
  return Array.from({ length: 8 }, (_, index) => {
    const start = addDays(first, index * 7)
    return bucketFrom(start, addDays(start, 7))
  })
}

export const inRange = (date: Date, range: { start: Date; end: Date }): boolean => {
  const time = date.getTime()
  return time >= range.start.getTime() && time < range.end.getTime()
}
