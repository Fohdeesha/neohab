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
  labelMode?: string
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

// uPlot gives each axis a flat 50px, sized for its own 12px default font. Ours is the tile's, so a
// time axis at 16px draws its date line 5px past the bottom of the canvas. The room an axis needs
// is the tick, the gap and its lines of text - never less than uPlot's own number, so no chart that
// fits today gets a narrower gutter.
const AXIS_SIZE = 50
const AXIS_TICK = 10
const AXIS_GAP = 5
const AXIS_LINE = 1.5
const MIN_PLOT_H = 46
const MIN_PLOT_W = 90

export function axisRoom(fontPx: number, lines: number): number {
  return Math.max(AXIS_SIZE, Math.ceil(AXIS_TICK + AXIS_GAP + lines * fontPx * AXIS_LINE))
}

export function axisWidthFor(labelPx: number): number {
  return Math.max(AXIS_SIZE, Math.ceil(labelPx) + AXIS_TICK + AXIS_GAP)
}

// and it puts no floor under what is left, so a short tile ended up with a zero-height plot: a
// straight line, no labels, nothing to read. An axis is worth its space only while the plot keeps a
// usable share of the canvas.
export function axesFit(width: number, height: number, fontPx: number): { x: boolean; y: boolean } {
  return { x: height >= axisRoom(fontPx, 2) + MIN_PLOT_H, y: width >= AXIS_SIZE + MIN_PLOT_W }
}
