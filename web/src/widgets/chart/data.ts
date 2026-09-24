import { getItemHistory, type HistoryPoint } from '../../api/persistence'
import { aggregateSeries, heatmapMatrix, type AggregateFunction, type GroupBy, type HeatmapData } from './aggregate'
import { DEFAULT_MAX_POINTS, decimate } from './model'

export type SeriesTable = [number[], (number | null)[]]

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

export interface AggregationRows {
  xs: number[]
  ys: (number | null)[]
  // the first row is the value carried in from before the window, which held time but is not an event in it
  leadingBoundary: boolean
}

/**
 * What aggregation may count. openHAB's REST adds rows that exist for drawing, not events: with
 * boundary=true one row at the window's start and one at its end, and for a Switch or Contact the
 * previous state repeated at the instant of every change, so a line steps instead of sloping.
 * Counted as samples they doubled a switch's count and sum, and the end row put a bar one bucket past
 * a window in the past.
 */
export function aggregationRows(points: HistoryPoint[], from: number, to: number, boundary: boolean): AggregationRows {
  const xs: number[] = []
  const ys: (number | null)[] = []
  let leadingBoundary = false
  for (let i = 0; i < points.length; i++) {
    const t = points[i].time / 1000
    if (t >= to) continue
    // of two rows at one instant the earlier held for no time: a replica, or a duplicate
    if (i + 1 < points.length && points[i + 1].time === points[i].time) continue
    if (xs.length === 0 && boundary && t <= from) leadingBoundary = true
    xs.push(Math.max(t, from))
    ys.push(parseState(points[i].state))
  }
  return { xs, ys, leadingBoundary }
}

export interface LoadRequest {
  items: string[]
  aggregates: (AggregateFunction | undefined)[]
  from: number
  to: number
  groupBy: GroupBy
  service?: string
  maxPoints?: number
  signal?: AbortSignal
}

// a window can reach past now (today, this month): the value in force now is not the value for the rest of it
const walkEnd = (to: number): number => Math.min(to, Date.now() / 1000)

function fetchSeries(item: string, req: { from: number; to: number; service?: string; signal?: AbortSignal }, boundary: boolean) {
  return getItemHistory(item, new Date(req.from * 1000), {
    serviceId: req.service || undefined,
    endTime: new Date(req.to * 1000),
    boundary,
    signal: req.signal
  })
}

export async function loadChartData(req: LoadRequest): Promise<SeriesTable[]> {
  const grouping = req.groupBy !== 'none'
  const raw = await Promise.all(req.items.map((item) => fetchSeries(item, req, grouping)))
  const maxPoints = req.maxPoints ?? DEFAULT_MAX_POINTS
  return raw.map((points, i) => {
    if (!grouping) {
      const xs: number[] = []
      const ys: (number | null)[] = []
      for (const pt of points) {
        const t = pt.time / 1000
        xs.push(t < req.from ? req.from : t)
        ys.push(parseState(pt.state))
      }
      return decimate(xs, ys, maxPoints)
    }
    const rows = aggregationRows(points, req.from, req.to, true)
    // never decimated: a bucket is already a reduction, and averaging buckets together destroys what a sum
    // or a count means. The bucket count is bounded by the window anyway.
    return aggregateSeries(rows.xs, rows.ys, walkEnd(req.to), req.groupBy, req.aggregates[i] ?? 'average', rows.leadingBoundary)
  })
}

export async function loadHeatmapData(req: {
  item: string
  aggregate: AggregateFunction | undefined
  from: number
  to: number
  service?: string
  signal?: AbortSignal
}): Promise<HeatmapData> {
  const points = await fetchSeries(req.item, req, true)
  const rows = aggregationRows(points, req.from, req.to, true)
  return heatmapMatrix(rows.xs, rows.ys, walkEnd(req.to), req.aggregate ?? 'average', rows.leadingBoundary)
}
