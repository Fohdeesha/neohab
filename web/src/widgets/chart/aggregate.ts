/**
 * Aggregation for the chart widget: grouping a history into buckets, the hour-by-weekday heatmap
 * matrix, and the calendar windows the expanded chart view steps through.
 *
 * openHAB's persistence REST API has no aggregation of its own (starttime/endtime/paging and
 * nothing else - checked against core), so all of this happens here, on the data the chart has
 * already fetched.
 *
 * The data model is deliberately explicit about *what* is being averaged. openHAB persistence is
 * usually change-based: a value is stored once and then holds until the next change, so counting
 * stored rows equally would make a value that held for an hour weigh the same as one that held
 * for a second. Two families of function follow from that:
 *
 *   - interval functions (average, min, max, first, last) look at the value over TIME. Each
 *     sample covers the interval until the next one, split at bucket boundaries, so a bucket with
 *     no stored row of its own still reports the value that was in force during it.
 *   - sample functions (sum, count) look at the stored rows themselves, and a bucket with no rows
 *     is empty for them - a sum of readings that invented values would be a lie.
 *
 * Everything here is pure and works in local time (a "day" is the user's day, DST included).
 */

export type AggregateFunction = 'average' | 'min' | 'max' | 'first' | 'last' | 'sum' | 'count'

export type GroupBy =
  | 'none'
  /** Fixed time buckets, plotted on the time axis. */
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  /** Categorical buckets, plotted on a numeric axis with named ticks. */
  | 'hourOfDay'
  | 'dayOfWeek'
  | 'monthOfYear'

export const AGGREGATE_FUNCTIONS: AggregateFunction[] = ['average', 'min', 'max', 'first', 'last', 'sum', 'count']

/** True for the group-bys whose x values are category indexes rather than timestamps. */
export function isCategorical(groupBy: GroupBy): boolean {
  return groupBy === 'hourOfDay' || groupBy === 'dayOfWeek' || groupBy === 'monthOfYear'
}

/* -------------------------------- bucket boundaries -------------------------------- */

/** The bucket a timestamp (seconds) belongs to: its key, and when the bucket ends (seconds). */
interface BucketOf {
  key: number
  end: number
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const startOfHour = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours())
/** Monday-based week start, matching ISO weeks (and the day-of-week ordering used below). */
const startOfWeek = (d: Date): Date => {
  const s = startOfDay(d)
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}
const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1)
const addDays = (d: Date, n: number): Date => {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}
const secs = (d: Date): number => d.getTime() / 1000

function bucketFor(groupBy: GroupBy, tSec: number): BucketOf {
  const d = new Date(tSec * 1000)
  switch (groupBy) {
    case 'hour': {
      const s = startOfHour(d)
      return { key: secs(s), end: secs(new Date(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours() + 1)) }
    }
    case 'day': {
      const s = startOfDay(d)
      return { key: secs(s), end: secs(addDays(s, 1)) }
    }
    case 'week': {
      const s = startOfWeek(d)
      return { key: secs(s), end: secs(addDays(s, 7)) }
    }
    case 'month': {
      const s = startOfMonth(d)
      return { key: secs(s), end: secs(new Date(s.getFullYear(), s.getMonth() + 1, 1)) }
    }
    case 'hourOfDay': {
      const s = startOfHour(d)
      return { key: d.getHours(), end: secs(new Date(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours() + 1)) }
    }
    case 'dayOfWeek': {
      const s = startOfDay(d)
      return { key: (d.getDay() + 6) % 7, end: secs(addDays(s, 1)) }
    }
    case 'monthOfYear': {
      const s = startOfMonth(d)
      return { key: d.getMonth(), end: secs(new Date(s.getFullYear(), s.getMonth() + 1, 1)) }
    }
    default:
      return { key: tSec, end: tSec }
  }
}

/* --------------------------------- accumulation --------------------------------- */

interface Acc {
  /** interval family */
  weighted: number
  weight: number
  min: number
  max: number
  firstAt: number
  firstValue: number
  lastAt: number
  lastValue: number
  /** sample family */
  sum: number
  count: number
}

const newAcc = (): Acc => ({
  weighted: 0,
  weight: 0,
  min: Infinity,
  max: -Infinity,
  firstAt: Infinity,
  firstValue: NaN,
  lastAt: -Infinity,
  lastValue: NaN,
  sum: 0,
  count: 0,
})

function valueOf(acc: Acc, fn: AggregateFunction): number | null {
  switch (fn) {
    case 'sum':
      return acc.count > 0 ? acc.sum : null
    case 'count':
      return acc.count > 0 ? acc.count : null
    case 'min':
      return acc.min === Infinity ? null : acc.min
    case 'max':
      return acc.max === -Infinity ? null : acc.max
    case 'first':
      return Number.isFinite(acc.firstValue) ? acc.firstValue : null
    case 'last':
      return Number.isFinite(acc.lastValue) ? acc.lastValue : null
    default: {
      if (acc.weight > 0) return acc.weighted / acc.weight
      // a bucket whose only sample sits exactly at its end has no duration to weigh
      return acc.count > 0 ? acc.sum / acc.count : null
    }
  }
}

/**
 * Walk the samples as time intervals, splitting each at bucket boundaries, and hand every piece
 * to `onPiece`. Sample-level facts (a stored row) go to `onSample`. `endSec` closes the last
 * interval - the end of the window being charted, not "now", so a fixed window is reproducible.
 */
function walk(
  xs: number[],
  ys: (number | null)[],
  endSec: number,
  groupBy: GroupBy,
  onPiece: (key: number, value: number, seconds: number, atSec: number) => void,
  onSample: (key: number, value: number, atSec: number) => void
): void {
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i]
    if (v === null || !Number.isFinite(v)) continue
    const from = xs[i]
    const until = Math.max(from, i + 1 < xs.length ? xs[i + 1] : endSec)
    onSample(bucketFor(groupBy, from).key, v, from)
    let cur = from
    // A zero-length interval (the final sample at the window end, or two samples at the same
    // instant) still names its bucket, so `first`/`last`/`min`/`max` see it.
    if (until === cur) {
      onPiece(bucketFor(groupBy, cur).key, v, 0, cur)
      continue
    }
    while (cur < until) {
      const b = bucketFor(groupBy, cur)
      const pieceEnd = Math.min(until, b.end > cur ? b.end : until)
      onPiece(b.key, v, pieceEnd - cur, cur)
      cur = pieceEnd
    }
  }
}

/**
 * Group a series into buckets. Returns the bucket keys (timestamps in seconds for time buckets,
 * category indexes for the categorical ones) and one aggregated value each, in ascending key
 * order. `groupBy: 'none'` returns the input untouched.
 */
export function aggregateSeries(
  xs: number[],
  ys: (number | null)[],
  endSec: number,
  groupBy: GroupBy,
  fn: AggregateFunction
): [number[], (number | null)[]] {
  if (groupBy === 'none') return [xs, ys]
  const buckets = new Map<number, Acc>()
  const at = (key: number): Acc => {
    let acc = buckets.get(key)
    if (!acc) {
      acc = newAcc()
      buckets.set(key, acc)
    }
    return acc
  }
  walk(
    xs,
    ys,
    endSec,
    groupBy,
    (key, value, seconds, atSec) => {
      const acc = at(key)
      acc.weighted += value * seconds
      acc.weight += seconds
      if (value < acc.min) acc.min = value
      if (value > acc.max) acc.max = value
      if (atSec < acc.firstAt) {
        acc.firstAt = atSec
        acc.firstValue = value
      }
      if (atSec >= acc.lastAt) {
        acc.lastAt = atSec
        acc.lastValue = value
      }
    },
    (key, value) => {
      const acc = at(key)
      acc.sum += value
      acc.count++
    }
  )
  const keys = [...buckets.keys()].sort((a, b) => a - b)
  const outX: number[] = []
  const outY: (number | null)[] = []
  for (const key of keys) {
    const v = valueOf(buckets.get(key)!, fn)
    if (v === null) continue
    outX.push(key)
    outY.push(v)
  }
  return [outX, outY]
}

/* ----------------------------------- heatmap ----------------------------------- */

export const HEATMAP_ROWS = 7 // Monday..Sunday
export const HEATMAP_COLS = 24 // hour of day

export interface HeatmapData {
  /** [weekday 0=Monday][hour 0..23] -> aggregated value, or null where nothing is known. */
  cells: (number | null)[][]
  min: number
  max: number
}

/**
 * The classic "when does this happen" matrix: hour of day across, day of week down, aggregated
 * over the whole window. Hours nest inside days, so splitting the intervals at hour boundaries
 * also keeps every piece inside one weekday.
 */
export function heatmapMatrix(
  xs: number[],
  ys: (number | null)[],
  endSec: number,
  fn: AggregateFunction
): HeatmapData {
  const accs = new Map<number, Acc>()
  const at = (key: number): Acc => {
    let acc = accs.get(key)
    if (!acc) {
      acc = newAcc()
      accs.set(key, acc)
    }
    return acc
  }
  const cellKey = (tSec: number): number => {
    const d = new Date(tSec * 1000)
    return ((d.getDay() + 6) % 7) * HEATMAP_COLS + d.getHours()
  }
  // 'hourOfDay' gives the boundary walk the hour splits; the key is recomputed per piece so it
  // carries the weekday too.
  walk(
    xs,
    ys,
    endSec,
    'hourOfDay',
    (_key, value, seconds, atSec) => {
      const acc = at(cellKey(atSec))
      acc.weighted += value * seconds
      acc.weight += seconds
      if (value < acc.min) acc.min = value
      if (value > acc.max) acc.max = value
      if (atSec < acc.firstAt) {
        acc.firstAt = atSec
        acc.firstValue = value
      }
      if (atSec >= acc.lastAt) {
        acc.lastAt = atSec
        acc.lastValue = value
      }
    },
    // Stored rows, counted in the cell they were recorded in - the same thing `sum` and `count`
    // mean on a grouped chart. Accumulating them per time-slice instead made `count` on a heatmap
    // count hours rather than readings, which is a different question with the same name on it.
    (_key, value, atSec) => {
      const acc = at(cellKey(atSec))
      acc.sum += value
      acc.count++
    }
  )
  const cells: (number | null)[][] = []
  let min = Infinity
  let max = -Infinity
  for (let row = 0; row < HEATMAP_ROWS; row++) {
    const line: (number | null)[] = []
    for (let col = 0; col < HEATMAP_COLS; col++) {
      const acc = accs.get(row * HEATMAP_COLS + col)
      const v = acc ? valueOf(acc, fn) : null
      line.push(v)
      if (v !== null) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    cells.push(line)
  }
  return { cells, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max }
}

/* ------------------------------- calendar windows ------------------------------- */

export type CalendarUnit = 'day' | 'week' | 'month' | 'year'

export interface TimeWindow {
  /** Seconds since the epoch. */
  from: number
  to: number
}

/**
 * An aligned calendar window: `offset` 0 is the one containing `nowMs`, -1 the one before it.
 * Aligned windows are what makes "previous month" mean the whole of last month rather than
 * "30 days ago to now".
 */
export function calendarWindow(unit: CalendarUnit, offset: number, nowMs: number): TimeWindow {
  const now = new Date(nowMs)
  switch (unit) {
    case 'day': {
      const s = startOfDay(now)
      s.setDate(s.getDate() + offset)
      return { from: secs(s), to: secs(addDays(s, 1)) }
    }
    case 'week': {
      const s = startOfWeek(now)
      s.setDate(s.getDate() + offset * 7)
      return { from: secs(s), to: secs(addDays(s, 7)) }
    }
    case 'month': {
      const s = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      return { from: secs(s), to: secs(new Date(s.getFullYear(), s.getMonth() + 1, 1)) }
    }
    default: {
      const s = new Date(now.getFullYear() + offset, 0, 1)
      return { from: secs(s), to: secs(new Date(s.getFullYear() + 1, 0, 1)) }
    }
  }
}

/** Human label for a calendar window ("29 July 2026", "July 2026", "2026", "week of 27 July"). */
export function calendarLabel(unit: CalendarUnit, window: TimeWindow, locale?: string): string {
  const d = new Date(window.from * 1000)
  switch (unit) {
    case 'day':
      return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    case 'week': {
      const end = new Date((window.to - 1) * 1000)
      const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
      return `${fmt.format(d)} – ${fmt.format(end)} ${d.getFullYear()}`
    }
    case 'month':
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d)
    default:
      return String(d.getFullYear())
  }
}

/** True when the window covers the moment `nowMs` (so "next" would step into the future). */
export function windowIsCurrent(window: TimeWindow, nowMs: number): boolean {
  const now = nowMs / 1000
  return now >= window.from && now < window.to
}

/** Tick labels for a categorical group-by (weekday and month names come from the locale). */
export function categoryLabels(groupBy: GroupBy, locale?: string): string[] {
  if (groupBy === 'hourOfDay') return Array.from({ length: 24 }, (_, h) => String(h))
  if (groupBy === 'dayOfWeek') {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    // 2024-01-01 was a Monday, which is index 0 here
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
  }
  if (groupBy === 'monthOfYear') {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short' })
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)))
  }
  return []
}
