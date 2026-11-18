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

// a series up to this long is kept whole and reduced exactly as it always was. A longer one is folded into
// a fine grid as it arrives, so a year of a busy item is never held to draw a few hundred points
export const LINE_ROWS_KEPT = 200_000
// cells in that grid: at least 64 for each point drawn, since a cell cut by a bucket's edge is split by time
const FINE_MIN = 50_000
const FINE_MAX = 200_000

interface FineGrid {
  push(x: number, y: number | null): void
  points(): [number[], (number | null)[]]
}

// the mean a value held over each cell, which is what decimate works out for its own, far wider, ones.
// A value or a gap that begins inside a cell keeps the moment it began, and the last row keeps its own, so
// decimate lays the same buckets over this as it would over the rows. When a row lands past the grid's
// end the cells are merged in pairs, so the rows always fill at least half of them
function fineGrid(x0: number, x1: number, cells: number): FineGrid | null {
  let width = (x1 - x0) / cells
  if (!(width > 0)) return null
  const held = new Float64Array(cells)
  const area = new Float64Array(cells)
  // rows that begin in a cell, for one where no value held any time
  const sum = new Float64Array(cells)
  const count = new Uint32Array(cells)
  const valueFrom = new Float64Array(cells).fill(Infinity)
  const gapFrom = new Float64Array(cells).fill(Infinity)
  const half = cells / 2
  const cellOf = (x: number): number => Math.min(cells - 1, Math.max(0, Math.floor((x - x0) / width)))
  const reach = (x: number): void => {
    while (x >= x0 + cells * width) {
      for (let c = 0; c < half; c++) {
        held[c] = held[2 * c] + held[2 * c + 1]
        area[c] = area[2 * c] + area[2 * c + 1]
        sum[c] = sum[2 * c] + sum[2 * c + 1]
        count[c] = count[2 * c] + count[2 * c + 1]
        valueFrom[c] = Math.min(valueFrom[2 * c], valueFrom[2 * c + 1])
        gapFrom[c] = Math.min(gapFrom[2 * c], gapFrom[2 * c + 1])
      }
      held.fill(0, half)
      area.fill(0, half)
      sum.fill(0, half)
      count.fill(0, half)
      valueFrom.fill(Infinity, half)
      gapFrom.fill(Infinity, half)
      width *= 2
    }
  }
  let has = false
  let px = 0
  let py: number | null = null
  const hold = (until: number): void => {
    if (py === null || !(until > px)) return
    for (let c = cellOf(px); c < cells; c++) {
      const start = x0 + c * width
      if (start >= until) break
      const from = Math.max(px, start)
      const to = Math.min(until, start + width)
      if (!(to > from)) continue
      held[c] += to - from
      area[c] += py * (to - from)
      if (from < valueFrom[c]) valueFrom[c] = from
    }
  }
  return {
    push(x, y) {
      reach(x)
      if (has) hold(x)
      const c = cellOf(x)
      if (y === null) {
        if (x < gapFrom[c]) gapFrom[c] = x
      } else {
        sum[c] += y
        count[c]++
        if (x < valueFrom[c]) valueFrom[c] = x
      }
      has = true
      px = x
      py = y
    },
    points() {
      const xs: number[] = []
      const ys: (number | null)[] = []
      for (let c = 0; c < cells; c++) {
        const value = held[c] > 0 ? area[c] / held[c] : count[c] > 0 ? sum[c] / count[c] : null
        const gap = gapFrom[c] < Infinity
        if (value !== null && gap && gapFrom[c] < valueFrom[c]) {
          xs.push(gapFrom[c], valueFrom[c])
          ys.push(null, value)
        } else if (value !== null) {
          xs.push(valueFrom[c])
          ys.push(value)
          if (gap) {
            xs.push(gapFrom[c])
            ys.push(null)
          }
        } else if (gap) {
          xs.push(gapFrom[c])
          ys.push(null)
        }
      }
      if (has && xs.length > 0 && px > xs[xs.length - 1]) {
        xs.push(px)
        ys.push(py)
      }
      return [xs, ys]
    }
  }
}

export interface LineReducer {
  push(x: number, y: number | null): void
  finish(): [number[], (number | null)[]]
}

/** decimate(), fed a row at a time. */
export function lineReducer(maxPoints: number): LineReducer {
  let xs: number[] = []
  let ys: (number | null)[] = []
  let fine: FineGrid | null = null
  return {
    push(x, y) {
      if (fine) {
        fine.push(x, y)
        return
      }
      xs.push(x)
      ys.push(y)
      if (xs.length <= LINE_ROWS_KEPT) return
      const cells = maxPoints > 0 ? Math.min(FINE_MAX, Math.max(FINE_MIN, 2 * Math.ceil(maxPoints * 64))) : FINE_MAX
      const grid = fineGrid(xs[0], x, cells)
      if (!grid) return
      for (let i = 0; i < xs.length; i++) grid.push(xs[i], ys[i])
      fine = grid
      xs = []
      ys = []
    },
    finish() {
      const [fx, fy] = fine ? fine.points() : [xs, ys]
      return decimate(fx, fy, maxPoints)
    }
  }
}

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
