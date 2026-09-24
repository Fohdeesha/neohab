export type AggregateFunction = 'average' | 'min' | 'max' | 'first' | 'last' | 'sum' | 'count'

export type GroupBy = 'none' | 'hour' | 'day' | 'week' | 'month' | 'hourOfDay' | 'dayOfWeek' | 'monthOfYear'

export const AGGREGATE_FUNCTIONS: AggregateFunction[] = ['average', 'min', 'max', 'first', 'last', 'sum', 'count']

export function isCategorical(groupBy: GroupBy): boolean {
  return groupBy === 'hourOfDay' || groupBy === 'dayOfWeek' || groupBy === 'monthOfYear'
}

interface BucketOf {
  key: number
  end: number
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const startOfHour = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours())
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

interface Acc {
  weighted: number
  weight: number
  min: number
  max: number
  firstAt: number
  firstValue: number
  lastAt: number
  lastValue: number
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
  count: 0
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
      return acc.count > 0 ? acc.sum / acc.count : null
    }
  }
}

function walk(
  xs: number[],
  ys: (number | null)[],
  endSec: number,
  groupBy: GroupBy,
  onPiece: (key: number, value: number, seconds: number, atSec: number) => void,
  onSample: (key: number, value: number, atSec: number) => void,
  leadingBoundary = false
): void {
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i]
    if (v === null || !Number.isFinite(v)) continue
    const from = xs[i]
    if (from >= endSec) continue
    const until = Math.max(from, Math.min(endSec, i + 1 < xs.length ? xs[i + 1] : endSec))
    // the value carried in from before the window held time in it, but it is not a stored row in it
    if (!(leadingBoundary && i === 0)) onSample(bucketFor(groupBy, from).key, v, from)
    let cur = from
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

export function aggregateSeries(
  xs: number[],
  ys: (number | null)[],
  endSec: number,
  groupBy: GroupBy,
  fn: AggregateFunction,
  leadingBoundary = false
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
    },
    leadingBoundary
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

export const HEATMAP_ROWS = 7 // Monday..Sunday
export const HEATMAP_COLS = 24 // hour of day

export interface HeatmapData {
  cells: (number | null)[][]
  min: number
  max: number
}

export function heatmapMatrix(
  xs: number[],
  ys: (number | null)[],
  endSec: number,
  fn: AggregateFunction,
  leadingBoundary = false
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
    (_key, value, atSec) => {
      const acc = at(cellKey(atSec))
      acc.sum += value
      acc.count++
    },
    leadingBoundary
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

export type CalendarUnit = 'day' | 'week' | 'month' | 'year'

export interface TimeWindow {
  from: number
  to: number
}

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

export function calendarLabel(unit: CalendarUnit, window: TimeWindow, locale?: string): string {
  const d = new Date(window.from * 1000)
  switch (unit) {
    case 'day':
      return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
    case 'week': {
      const end = new Date((window.to - 1) * 1000)
      const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
      return `${fmt.format(d)} - ${fmt.format(end)} ${d.getFullYear()}`
    }
    case 'month':
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d)
    default:
      return String(d.getFullYear())
  }
}

export function windowIsCurrent(window: TimeWindow, nowMs: number): boolean {
  const now = nowMs / 1000
  return now >= window.from && now < window.to
}

export function categoryLabels(groupBy: GroupBy, locale?: string): string[] {
  if (groupBy === 'hourOfDay') return Array.from({ length: 24 }, (_, h) => String(h))
  if (groupBy === 'dayOfWeek') {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
  }
  if (groupBy === 'monthOfYear') {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'short' })
    return Array.from({ length: 12 }, (_, m) => fmt.format(new Date(2024, m, 1)))
  }
  return []
}
