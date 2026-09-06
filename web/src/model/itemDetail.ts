/**
 * The facts the widget detail sheet shows about one item, and the rules for reading them safely.
 *
 * The timestamps are the interesting part. openHAB 5.x serves `lastState`, `lastStateUpdate` and
 * `lastStateChange` on the item DTO; **openHAB 4.3.7 serves none of them** (checked against both
 * running servers, not against the reference checkout). So every read here is optional by design,
 * and where the server has no answer the history does: `lastChangeFromHistory` walks a window of
 * persistence backwards to the last value that differed.
 *
 * What that costs, stated rather than glossed over: the answer is when the change was STORED, so a
 * service running an `everyMinute` strategy can be up to a minute late, and one storing only on
 * change is exact. It is also bounded by the window - beyond it the row says so instead of
 * pretending to a precision it never had.
 */
import type { Item } from '../api/types'

/** Epoch milliseconds, or undefined when the value is absent or unusable. */
function epoch(value: unknown): number | undefined {
  // A number, or the string form some serializations produce. Gson's float echo (1.7e12) parses
  // through Number just as well.
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return undefined
  return n
}

/**
 * When the item last took a DIFFERENT state. openHAB 5.x only.
 *
 * Null is accepted as readily as undefined: the caller usually has "not fetched yet" in hand,
 * and that is the same answer as "this server does not serve it" - no timestamp to show.
 */
export function lastChangeAt(item: Pick<Item, 'lastStateChange'> | null | undefined): number | undefined {
  return epoch(item?.lastStateChange)
}

/** When the item was last updated, whether or not the value differed. openHAB 5.x only. */
export function lastUpdateAt(item: Pick<Item, 'lastStateUpdate'> | null | undefined): number | undefined {
  return epoch(item?.lastStateUpdate)
}

/**
 * How far back the sheet asks persistence for a change. A day, because that is what one request
 * can carry: measured against the production server's rrd4j, a day of a one-minute archive is
 * ~1440 rows and 56 KB, and a week is 10,000 rows and 390 KB - too much to spend on one line of a
 * popup. It is also the window the sheet's own chart draws, so both halves tell one story.
 */
export const CHANGE_LOOKBACK_MS = 24 * 3600e3

/** What a window of history can say about the last change. */
export type HistoryChange =
  | { kind: 'at'; time: number }
  /** There is history, and the value held the whole window: older than the lookback. */
  | { kind: 'before' }
  /** No history at all - nothing stored, or persistence could not be asked. */
  | { kind: 'unknown' }

/**
 * Same stored value? Numerically when both sides are numbers, because persistence writes a
 * BigDecimal ("64") where the item may hold "64.0", and a difference in spelling is not a change.
 */
function sameStoredState(a: string, b: string): boolean {
  if (a === b) return true
  const [x, y] = [a.trim(), b.trim()]
  if (x === '' || y === '') return x === y
  const [nx, ny] = [Number(x), Number(y)]
  return Number.isFinite(nx) && Number.isFinite(ny) ? nx === ny : x === y
}

/**
 * When the value last differed, from a window of history in ascending time order.
 *
 * "Current" is taken from the NEWEST stored row rather than from the live item state: persistence
 * strips units and normalises numbers, so comparing its rows against a live "22.5 °C" would call
 * every row a change. Walking back to the first row that differs, the change is the row after it -
 * which is also right for Switch and Contact items, where the REST layer repeats the previous
 * state at the transition instant so a plot draws no diagonal.
 */
export function lastChangeFromHistory(points: readonly { time: number; state: string }[]): HistoryChange {
  const rows = (Array.isArray(points) ? points : []).filter((p) => p && Number.isFinite(p.time) && typeof p.state === 'string')
  if (rows.length === 0) return { kind: 'unknown' }
  const current = rows[rows.length - 1].state
  for (let i = rows.length - 2; i >= 0; i--) {
    if (!sameStoredState(rows[i].state, current)) return { kind: 'at', time: rows[i + 1].time }
  }
  return { kind: 'before' }
}

/**
 * The units this formatter works in. Named as a union rather than borrowing
 * `Intl.RelativeTimeFormatUnit`, which also carries plurals, quarters and weeks: spelling the
 * closed set out is what lets the compiler pin the DIVISOR lookup below, so it needs no runtime
 * guard of its own (see model/lookup.ts for why a `Record<string, ...>` would).
 */
type RelativeUnit = 'second' | 'minute' | 'hour' | 'day' | 'month' | 'year'

/** Thresholds in seconds, each with the unit to render at or below it. */
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

/**
 * "2 minutes ago", in the viewer's language, from `Intl.RelativeTimeFormat` rather than from the
 * catalogs: every language would otherwise need a plural form per unit, which is six catalogs
 * times six units before Polish's one/few/many are counted, all to restate what the platform
 * already knows.
 *
 * A timestamp in the future is a clock disagreeing with itself, never a real answer to "when did
 * this last change", so it renders as the present instead of counting forwards.
 */
export function relativeTime(then: number, now: number, locale?: string): string | undefined {
  if (!Number.isFinite(then) || !Number.isFinite(now)) return undefined
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  const unit = STEPS.find(([limit]) => seconds < limit)?.[1] ?? 'year'
  const value = Math.round(seconds / DIVISOR[unit])
  try {
    // `numeric: 'auto'` lets a language use its own word where it has one ("yesterday").
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-value, unit)
  } catch {
    // An unusable locale tag must not take the sheet down with it.
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-value, unit)
  }
}

/**
 * The item's page in Main UI, which is where someone goes to change what the item IS rather than
 * what it currently holds. Path only, so it can be tested without a browser; the caller resolves
 * it against openHAB's own prefix so it survives a sub-path reverse proxy.
 */
export function mainUiItemPath(name: string): string {
  return '/settings/items/' + encodeURIComponent(name)
}
