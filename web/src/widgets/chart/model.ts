import { lookup } from '../../model/lookup'
import type { AggregateFunction, GroupBy } from './aggregate'

export interface ChartSeries {
  item: string
  label?: string
  aggregate?: AggregateFunction
  kind?: 'line' | 'bar'
  color?: string
  axis?: 'y' | 'y2'
  width?: number
  fill?: number
  mode?: 'smooth' | 'linear' | 'step'
  points?: boolean
}

export interface ChartThreshold {
  from?: number
  to?: number
  axis?: 'y' | 'y2'
  color?: string
  label?: string
}

export interface ChartConfig {
  item?: string
  groupBy?: GroupBy
  mode?: 'series' | 'heatmap'
  expand?: boolean
  series?: ChartSeries[]
  label?: string
  period?: string
  service?: string
  refresh?: number
  legend?: boolean
  picker?: boolean
  periods?: string[]
  live?: boolean
  yMin?: number
  yMax?: number
  y2Min?: number
  y2Max?: number
  thresholds?: ChartThreshold[]
  maxPoints?: number
}

export const DEFAULT_MAX_POINTS = 250

export function decimate(xs: number[], ys: (number | null)[], maxPoints: number): [number[], (number | null)[]] {
  const n = xs.length
  if (maxPoints <= 0 || n <= maxPoints) return [xs, ys]
  const x0 = xs[0]
  const span = (xs[n - 1] - x0) / maxPoints
  if (!(span > 0)) return [xs, ys]
  const outX: number[] = []
  const outY: (number | null)[] = []
  let i = 0
  for (let b = 0; b < maxPoints; b++) {
    const bStart = x0 + b * span
    const bEnd = b === maxPoints - 1 ? Infinity : x0 + (b + 1) * span
    let weighted = 0
    let weight = 0
    let sum = 0
    let count = 0
    while (i < n && xs[i] < bEnd) {
      const v = ys[i]
      if (v !== null) {
        const holdEnd = Math.min(i + 1 < n ? xs[i + 1] : xs[n - 1], bEnd === Infinity ? xs[n - 1] : bEnd)
        const w = Math.max(0, holdEnd - Math.max(xs[i], bStart))
        weighted += v * w
        weight += w
        sum += v
        count++
      }
      if (i + 1 < n && xs[i + 1] > bEnd) break
      i++
    }
    if (count === 0) continue
    outX.push(x0 + (b + 0.5) * span)
    outY.push(weight > 0 ? weighted / weight : sum / count)
  }
  return [outX, outY]
}

export const PERIODS: Record<string, number> = {
  '1h': 3600e3,
  '3h': 3 * 3600e3,
  '4h': 4 * 3600e3,
  '6h': 6 * 3600e3,
  '8h': 8 * 3600e3,
  '12h': 12 * 3600e3,
  '24h': 24 * 3600e3,
  '2d': 2 * 86400e3,
  '3d': 3 * 86400e3,
  '7d': 7 * 86400e3,
  '14d': 14 * 86400e3,
  '30d': 30 * 86400e3,
  '60d': 60 * 86400e3,
  '120d': 120 * 86400e3,
  '1y': 365 * 86400e3
}

export const PERIOD_CHIPS = ['1h', '3h', '6h', '12h', '24h', '7d', '30d', '1y']

export const PERIOD_IDS = Object.keys(PERIODS).sort((a, b) => PERIODS[a] - PERIODS[b])

export function periodMs(period: string | undefined): number {
  return lookup(PERIODS, period) ?? PERIODS['24h']
}

export function isPeriod(id: unknown): id is string {
  return typeof id === 'string' && lookup(PERIODS, id) !== undefined
}

export function chipPeriods(periods: unknown, defaultPeriod: string | undefined, current: string): string[] {
  const chosen = Array.isArray(periods) ? periods.filter(isPeriod) : null
  if (chosen !== null && chosen.length === 0) return []
  const set = new Set(chosen ?? PERIOD_CHIPS)
  if (isPeriod(defaultPeriod)) set.add(defaultPeriod)
  if (isPeriod(current)) set.add(current)
  return [...set].sort((a, b) => PERIODS[a] - PERIODS[b])
}

export function effectiveSeries(config: ChartConfig): ChartSeries[] {
  const stored = Array.isArray(config.series) ? config.series : []
  const list = stored.filter((s) => s && typeof s.item === 'string' && s.item !== '')
  if (list.length > 0) return list
  return typeof config.item === 'string' && config.item !== '' ? [{ item: config.item }] : []
}

export function effectiveThresholds(config: ChartConfig): ChartThreshold[] {
  return (Array.isArray(config.thresholds) ? config.thresholds : []).filter((t): t is ChartThreshold => !!t && typeof t === 'object')
}
