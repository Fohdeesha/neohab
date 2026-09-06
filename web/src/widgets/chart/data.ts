/**
 * Turning chart configuration into plottable data: fetch each series' history for a window, parse
 * the states, group them if the chart groups, and cap the point count.
 *
 * Shared by the chart widget and the expanded chart view so both show the same numbers for the
 * same configuration - the two differ in presentation (live updates and zoom against calendar
 * navigation), never in what the data means.
 */
import { getItemHistory } from '../../api/persistence'
import { aggregateSeries, isCategorical, type AggregateFunction, type GroupBy } from './aggregate'
import { DEFAULT_MAX_POINTS, decimate } from './model'

/** One series' data as [timestamps in seconds (or bucket indexes), values]. */
export type SeriesTable = [number[], (number | null)[]]

/** ON/OFF-style histories plot as 1/0 (persistence stores them as text). A Map, so a state that
 * happens to name an Object.prototype member isn't mistaken for a hit. */
const BINARY = new Map([
  ['ON', 1],
  ['OFF', 0],
  ['OPEN', 1],
  ['CLOSED', 0]
])

export function parseState(s: string): number | null {
  const b = BINARY.get(s)
  if (b !== undefined) return b
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : null
}

export interface LoadRequest {
  items: string[]
  /** Per-series aggregate function, aligned with `items`. */
  aggregates: (AggregateFunction | undefined)[]
  /** Window in seconds. `to` is exclusive, and closes the last held value. */
  from: number
  to: number
  groupBy: GroupBy
  service?: string
  maxPoints?: number
  signal?: AbortSignal
}

/**
 * Fetch and prepare every series. `boundary` is requested when grouping, because a bucket's value
 * often comes from a sample stored *before* the window - without it the first bucket of every
 * window would be empty for change-based persistence.
 */
export async function loadChartData(req: LoadRequest): Promise<SeriesTable[]> {
  const grouping = req.groupBy !== 'none'
  const raw = await Promise.all(
    req.items.map((item) =>
      getItemHistory(item, new Date(req.from * 1000), {
        serviceId: req.service || undefined,
        endTime: new Date(req.to * 1000),
        boundary: grouping,
        signal: req.signal
      })
    )
  )
  const maxPoints = req.maxPoints ?? DEFAULT_MAX_POINTS
  return raw.map((points, i) => {
    const xs: number[] = []
    const ys: (number | null)[] = []
    for (const pt of points) {
      const t = pt.time / 1000
      // a boundary sample sits outside the window; clamp it to the start so its value counts
      // from there rather than dragging the axis backwards
      xs.push(t < req.from ? req.from : t)
      ys.push(parseState(pt.state))
    }
    if (!grouping) return decimate(xs, ys, maxPoints)
    const [gx, gy] = aggregateSeries(xs, ys, req.to, req.groupBy, req.aggregates[i] ?? 'average')
    // categories are already at most 24 points; time buckets can still be many, so cap them
    return isCategorical(req.groupBy) ? [gx, gy] : decimate(gx, gy, maxPoints)
  })
}
