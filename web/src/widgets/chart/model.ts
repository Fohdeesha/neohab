/**
 * Chart widget config model. Kept free of uPlot imports so the settings editors and importer
 * can use it without pulling the chart chunk into the main bundle.
 */
import { lookup } from '../../model/lookup'
import type { AggregateFunction, GroupBy } from './aggregate'

export interface ChartSeries {
  item: string
  label?: string
  /**
   * How this series' samples are reduced inside each bucket when the chart groups (see
   * ChartConfig.groupBy). Two series on the same item with `average` and `max` are a normal and
   * useful pairing, which is why this is per series while the grouping is per chart.
   */
  aggregate?: AggregateFunction
  /** Bars suit aggregated buckets; lines suit a continuous reading. Default line. */
  kind?: 'line' | 'bar'
  /** CSS color; empty/undefined = automatic palette slot by series position. */
  color?: string
  /** Which y axis the series plots on. Default left ('y'); 'y2' adds a right axis. */
  axis?: 'y' | 'y2'
  /** Line width in px; 0 draws no line (fill/points only). Default 2. */
  width?: number
  /** Peak opacity (0-100) of the gradient fill under the line. Default 20; 0 = no fill. */
  fill?: number
  /** Line interpolation. Default 'smooth'; 'step' holds each value until the next change. */
  mode?: 'smooth' | 'linear' | 'step'
  /** Draw a dot at every data point. */
  points?: boolean
}

export interface ChartThreshold {
  /** A line at `from`, or a shaded band when both `from` and `to` are set. */
  from?: number
  to?: number
  axis?: 'y' | 'y2'
  color?: string
  label?: string
}

export interface ChartConfig {
  /** Legacy single-item shape; used only when `series` is absent or empty. */
  item?: string
  /**
   * Bucket the history before plotting: fixed periods (per hour/day/week/month) or categories
   * (hour of day, day of week, month of year). Chart-level, not per series: two series on
   * different axes of time would make the x axis meaningless.
   */
  groupBy?: GroupBy
  /**
   * 'heatmap' replaces the plot with an hour-by-weekday matrix of the FIRST series, aggregated
   * with that series' function - the one view a time-series plot cannot give.
   */
  mode?: 'series' | 'heatmap'
  /** Offer the full-screen view with calendar navigation (default on). */
  expand?: boolean
  series?: ChartSeries[]
  label?: string
  period?: string
  /** Persistence service id; empty = server default. */
  service?: string
  /** History re-fetch interval in seconds. */
  refresh?: number
  /** Legend row (only ever shown with two or more series). Default on. */
  legend?: boolean
  /** Quick period chips on the widget. Default on. */
  picker?: boolean
  /** Which ranges the chips offer; absent = {@link PERIOD_CHIPS}, empty = none. */
  periods?: string[]
  /** Append live item changes between history refreshes. Default on. */
  live?: boolean
  yMin?: number
  yMax?: number
  y2Min?: number
  y2Max?: number
  thresholds?: ChartThreshold[]
  /** Cap on rendered points per series (downsampled client-side); 0 = unlimited. */
  maxPoints?: number
}

export const DEFAULT_MAX_POINTS = 250

/**
 * Average-per-bucket decimation: cap a series at ~maxPoints so a year of minute-resolution
 * history doesn't bog the browser down. Buckets are equal TIME slices and each emits the
 * time-weighted mean of its samples (a state holds until the next sample), so the downsampled
 * line follows the dense render's center of mass - the same shape Grafana shows for an
 * averaged-down query. Min/max-per-bucket was tried first and rejected: emitting each
 * bucket's extremes turns noisy data into a full-amplitude sawtooth that looks nothing like
 * the raw plot.
 */
export function decimate(
  xs: number[],
  ys: (number | null)[],
  maxPoints: number
): [number[], (number | null)[]] {
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
        // the sample holds until the next one; clip the hold to this bucket both ways, since
        // a long-held state (change-based persistence) can span many buckets
        const holdEnd = Math.min(i + 1 < n ? xs[i + 1] : xs[n - 1], bEnd === Infinity ? xs[n - 1] : bEnd)
        const w = Math.max(0, holdEnd - Math.max(xs[i], bStart))
        weighted += v * w
        weight += w
        sum += v
        count++
      }
      // a sample held past the bucket boundary is revisited by the next bucket
      if (i + 1 < n && xs[i + 1] > bEnd) break
      i++
    }
    if (count === 0) continue
    // zero total weight (e.g. the final sample alone): plain mean of the bucket's samples
    outX.push(x0 + (b + 0.5) * span)
    outY.push(weight > 0 ? weighted / weight : sum / count)
  }
  return [outX, outY]
}

/** Period id -> milliseconds. Covers every HABPanel chart period exactly, and then some. */
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
  '1y': 365 * 86400e3,
}

/** The chips a chart offers until its author picks a set of their own. */
export const PERIOD_CHIPS = ['1h', '3h', '6h', '12h', '24h', '7d', '30d', '1y']

/** Every period id, longest last - the order the pickers and the chip row present them in. */
export const PERIOD_IDS = Object.keys(PERIODS).sort((a, b) => PERIODS[a] - PERIODS[b])

/**
 * How long a stored period id means, defaulting to a day.
 *
 * Through `lookup` because the id comes from stored configuration: a bare `PERIODS[period]` finds
 * `Object.prototype` for a period spelled `constructor` or `toString`, and since a function is not
 * nullish the `??` below never fires - the arithmetic downstream then quietly yields NaN.
 */
export function periodMs(period: string | undefined): number {
  return lookup(PERIODS, period) ?? PERIODS['24h']
}

/** Whether an id names a period we actually have. */
export function isPeriod(id: unknown): id is string {
  return typeof id === 'string' && lookup(PERIODS, id) !== undefined
}

/**
 * The period chips a chart or timeline offers, longest last.
 *
 * An author's own list is honoured as given, plus the two that always have to be reachable: the
 * range on screen now, and the widget's configured default. Without those a chip row can strand
 * you - pick another range and the one you came from has no chip to go back to. An empty list is
 * a deliberate "no chips", so it answers before either of them; a list naming only ranges that do
 * not exist answers the same way, since nothing in it can be offered.
 */
export function chipPeriods(periods: unknown, defaultPeriod: string | undefined, current: string): string[] {
  const chosen = Array.isArray(periods) ? periods.filter(isPeriod) : null
  if (chosen !== null && chosen.length === 0) return []
  const set = new Set(chosen ?? PERIOD_CHIPS)
  if (isPeriod(defaultPeriod)) set.add(defaultPeriod)
  if (isPeriod(current)) set.add(current)
  return [...set].sort((a, b) => PERIODS[a] - PERIODS[b])
}

/**
 * The series a config describes: the `series` list when present, else the legacy single
 * `item` as an implied series, so configs from before multi-series keep rendering.
 *
 * Guarded with `Array.isArray` rather than `?? []`: this runs during render, and stored
 * configuration is untrusted input - a `series` that is not a list threw straight out of the
 * chart's render, which with no boundary above it took the whole app down rather than one tile.
 */
export function effectiveSeries(config: ChartConfig): ChartSeries[] {
  const stored = Array.isArray(config.series) ? config.series : []
  const list = stored.filter((s) => s && typeof s.item === 'string' && s.item !== '')
  if (list.length > 0) return list
  return typeof config.item === 'string' && config.item !== '' ? [{ item: config.item }] : []
}

/** The thresholds a config describes, with the same guard for the same reason. */
export function effectiveThresholds(config: ChartConfig): ChartThreshold[] {
  return (Array.isArray(config.thresholds) ? config.thresholds : []).filter(
    (t): t is ChartThreshold => !!t && typeof t === 'object'
  )
}
