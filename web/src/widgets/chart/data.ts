import { readItemHistory, type HistoryPoint } from '../../api/persistence'
import { heatmapAggregation, seriesAggregation, type AggregateFunction, type GroupBy, type HeatmapData } from './aggregate'
import { DEFAULT_MAX_POINTS, lineReducer } from './model'

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

interface AggregationFeed {
  take(points: HistoryPoint[]): void
  done(): void
}

/**
 * What aggregation may count, a part at a time. openHAB's REST adds rows that exist for drawing, not
 * events: with boundary=true one row at the window's start and one at its end, and for a Switch or Contact
 * the previous state repeated at the instant of every change, so a line steps instead of sloping.
 * Counted as samples they doubled a switch's count and sum, and the end row put a bar one bucket past
 * a window in the past. `carriedIn` marks the first row when it is the value carried in from before the
 * window, which held time but is not an event in it.
 */
function aggregationFeed(
  from: number,
  to: number,
  boundary: boolean,
  push: (x: number, y: number | null, carriedIn: boolean) => void
): AggregationFeed {
  // one row behind: of two rows at one instant the earlier held for no time, a replica or a duplicate
  let pending: HistoryPoint | undefined
  let emitted = 0
  const emit = (p: HistoryPoint): void => {
    const t = p.time / 1000
    if (t >= to) return
    push(Math.max(t, from), parseState(p.state), emitted === 0 && boundary && t <= from)
    emitted++
  }
  return {
    take(points) {
      for (const p of points) {
        if (pending && pending.time !== p.time) emit(pending)
        pending = p
      }
    },
    done() {
      if (pending) emit(pending)
      pending = undefined
    }
  }
}

export function aggregationRows(points: HistoryPoint[], from: number, to: number, boundary: boolean): AggregationRows {
  const xs: number[] = []
  const ys: (number | null)[] = []
  let leadingBoundary = false
  const feed = aggregationFeed(from, to, boundary, (x, y, carriedIn) => {
    if (carriedIn) leadingBoundary = true
    xs.push(x)
    ys.push(y)
  })
  feed.take(points)
  feed.done()
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

interface Range {
  from: number
  to: number
  service?: string
  signal?: AbortSignal
}

function readSeries(item: string, req: Range, boundary: boolean, take: (rows: HistoryPoint[]) => void): Promise<void> {
  return readItemHistory(
    item,
    new Date(req.from * 1000),
    { serviceId: req.service || undefined, endTime: new Date(req.to * 1000), boundary, signal: req.signal },
    take
  )
}

async function loadLine(item: string, req: Range, maxPoints: number): Promise<SeriesTable> {
  const line = lineReducer(maxPoints)
  await readSeries(item, req, false, (rows) => {
    for (const pt of rows) {
      const t = pt.time / 1000
      line.push(t < req.from ? req.from : t, parseState(pt.state))
    }
  })
  return line.finish()
}

// never decimated: a bucket is already a reduction, and averaging buckets together destroys what a sum
// or a count means. The bucket count is bounded by the window anyway.
async function loadGrouped(item: string, req: Range, groupBy: GroupBy, fn: AggregateFunction | undefined): Promise<SeriesTable> {
  const buckets = seriesAggregation(walkEnd(req.to), groupBy, fn ?? 'average')
  const feed = aggregationFeed(req.from, req.to, true, buckets.push)
  await readSeries(item, req, true, feed.take)
  feed.done()
  return buckets.finish()
}

export function loadChartData(req: LoadRequest): Promise<SeriesTable[]> {
  const maxPoints = req.maxPoints ?? DEFAULT_MAX_POINTS
  return Promise.all(
    req.items.map((item, i) =>
      req.groupBy === 'none' ? loadLine(item, req, maxPoints) : loadGrouped(item, req, req.groupBy, req.aggregates[i])
    )
  )
}

export async function loadHeatmapData(req: {
  item: string
  aggregate: AggregateFunction | undefined
  from: number
  to: number
  service?: string
  signal?: AbortSignal
}): Promise<HeatmapData> {
  const cells = heatmapAggregation(walkEnd(req.to), req.aggregate ?? 'average')
  const feed = aggregationFeed(req.from, req.to, true, cells.push)
  await readSeries(req.item, req, true, feed.take)
  feed.done()
  return cells.finish()
}
