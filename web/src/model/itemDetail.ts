import type { Item } from '../api/types'

function epoch(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

export function lastChangeAt(item: Pick<Item, 'lastStateChange'> | null | undefined): number | undefined {
  return epoch(item?.lastStateChange)
}

// a day is what one request can carry: 1,441 rows on rrd4j, against 10,081 for a week
export const CHANGE_LOOKBACK_MS = 24 * 3600e3

export type HistoryChange = { kind: 'at'; time: number } | { kind: 'before' } | { kind: 'unknown' }

function sameStoredState(a: string, b: string): boolean {
  if (a === b) return true
  const [x, y] = [a.trim(), b.trim()]
  if (x === '' || y === '') return x === y
  const [nx, ny] = [Number(x), Number(y)]
  return Number.isFinite(nx) && Number.isFinite(ny) ? nx === ny : x === y
}

// "current" is the newest stored row, not the live item: persistence strips units, so a live "22.5 °C" makes
// every row look like a change
export function lastChangeFromHistory(points: readonly { time: number; state: string }[]): HistoryChange {
  const rows = (Array.isArray(points) ? points : []).filter((p) => p && Number.isFinite(p.time) && typeof p.state === 'string')
  if (rows.length === 0) return { kind: 'unknown' }
  const current = rows[rows.length - 1].state
  for (let i = rows.length - 2; i >= 0; i--) {
    if (!sameStoredState(rows[i].state, current)) return { kind: 'at', time: rows[i + 1].time }
  }
  return { kind: 'before' }
}

type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year'

const STEPS: [number, RelativeUnit][] = [
  [45, 'second'],
  [45 * 60, 'minute'],
  [22 * 3600, 'hour'],
  [26 * 86400, 'day'],
  [11 * 2629800, 'month']
]
const DIVISOR: Record<RelativeUnit, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  month: 2629800,
  year: 31557600
}

export function relativeTime(then: number, now: number, locale?: string): string | undefined {
  if (!Number.isFinite(then) || !Number.isFinite(now)) return undefined
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  const unit = STEPS.find(([limit]) => seconds < limit)?.[1] ?? 'year'
  const value = Math.round(seconds / DIVISOR[unit])
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-value, unit)
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-value, unit)
  }
}

export function mainUiItemPath(name: string): string {
  return '/settings/items/' + encodeURIComponent(name)
}
