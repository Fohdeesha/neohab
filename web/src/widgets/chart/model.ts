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

export const DEFAULT_MAX_POINTS = 2000

/**
 * Min/max-per-bucket decimation: cap a series at ~maxPoints while keeping the exact visual
 * envelope (every spike's extreme survives). A year of minute-resolution history is half a
 * million points - far more than any plot width can show, and enough to bog the browser down.
 */
export function decimate(
  xs: number[],
  ys: (number | null)[],
  maxPoints: number
): [number[], (number | null)[]] {
  const n = xs.length
  if (maxPoints <= 0 || n <= maxPoints) return [xs, ys]
  const buckets = Math.max(1, Math.floor(maxPoints / 2))
  const span = n / buckets
  const outX: number[] = []
  const outY: (number | null)[] = []
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * span)
    const end = Math.min(n, Math.floor((b + 1) * span))
    let minI = -1
    let maxI = -1
    for (let i = start; i < end; i++) {
      const v = ys[i]
      if (v === null) continue
      if (minI < 0 || v < (ys[minI] as number)) minI = i
      if (maxI < 0 || v > (ys[maxI] as number)) maxI = i
    }
    if (minI < 0) continue
    const first = Math.min(minI, maxI)
    const second = Math.max(minI, maxI)
    outX.push(xs[first])
    outY.push(ys[first])
    if (second !== first) {
      outX.push(xs[second])
      outY.push(ys[second])
    }
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
