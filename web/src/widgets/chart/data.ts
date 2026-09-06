import { getItemHistory } from '../../api/persistence'
import { aggregateSeries, isCategorical, type AggregateFunction, type GroupBy } from './aggregate'
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
      xs.push(t < req.from ? req.from : t)
      ys.push(parseState(pt.state))
    }
    if (!grouping) return decimate(xs, ys, maxPoints)
    const [gx, gy] = aggregateSeries(xs, ys, req.to, req.groupBy, req.aggregates[i] ?? 'average')
    return isCategorical(req.groupBy) ? [gx, gy] : decimate(gx, gy, maxPoints)
  })
}
