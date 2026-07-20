/**
 * Chart widget config model. Kept free of uPlot imports so the settings editors and importer
 * can use it without pulling the chart chunk into the main bundle.
 */

export interface ChartSeries {
  item: string
  label?: string
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

/** Period id -> milliseconds. Covers every HABPanel chart period exactly. */
export const PERIODS: Record<string, number> = {
  '1h': 3600e3,
  '4h': 4 * 3600e3,
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

/** Subset offered as quick chips; the configured default joins the row if it's not in here. */
export const PERIOD_CHIPS = ['1h', '12h', '24h', '7d', '30d', '1y']

/**
 * The series a config describes: the `series` list when present, else the legacy single
 * `item` as an implied series, so configs from before multi-series keep rendering.
 */
export function effectiveSeries(config: ChartConfig): ChartSeries[] {
  const list = (config.series ?? []).filter((s) => s && typeof s.item === 'string' && s.item !== '')
  if (list.length > 0) return list
  return config.item ? [{ item: config.item }] : []
}
