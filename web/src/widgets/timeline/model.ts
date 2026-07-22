/**
 * Timeline widget model: discrete state bands per item over a time window (HABPanel's
 * timeline). Pure data logic, kept apart from the component so the importer and tests can
 * use it without rendering.
 */
import type { HistoryPoint } from '../../api/persistence'

export interface TimelineSeries {
  item: string
  label?: string
}

export interface TimelineColorMap {
  state: string
  color: string
}

export interface TimelineConfig {
  series?: TimelineSeries[]
  /** Explicit state -> color rows; states not listed get chart-palette colors automatically. */
  colorMaps?: TimelineColorMap[]
  label?: string
  period?: string
  /** Persistence service id; empty = server default. */
  service?: string
  /** History re-fetch interval in seconds; empty = automatic from the period. */
  refresh?: number
  /** Quick period chips on the widget. Default on. */
  picker?: boolean
}

/** One contiguous run of a state. Times are epoch milliseconds, clipped to the window. */
export interface TimelineBand {
  state: string
  start: number
  end: number
}

/** States that mean "nothing known" - rendered as gaps, never as bands. */
const GAP_STATES = new Set(['NULL', 'UNDEF', ''])

export function effectiveTimelineSeries(config: TimelineConfig): TimelineSeries[] {
  return (config.series ?? []).filter((s) => s && typeof s.item === 'string' && s.item !== '')
}

/**
 * Collapse a history (ascending, ideally fetched with boundary=true so the state AT the
 * window start is known) into state runs clipped to [windowStart, now].
 */
export function partitionHistory(points: HistoryPoint[], windowStart: number, now: number): TimelineBand[] {
  const bands: TimelineBand[] = []
  let state: string | null = null
  let start = 0
  for (const p of points) {
    if (p.time > now) break
    if (state === null) {
      state = p.state
      start = p.time
      continue
    }
    if (p.state !== state) {
      bands.push({ state, start, end: p.time })
      state = p.state
      start = p.time
    }
  }
  if (state !== null) bands.push({ state, start, end: now })
  // clip to the window; the boundary point starts before it, and old runs may end inside it
  return bands
    .filter((b) => b.end > windowStart && !GAP_STATES.has(b.state))
    .map((b) => (b.start < windowStart ? { ...b, start: windowStart } : b))
}

/**
 * Automatic refetch cadence: half a "tick" of the window (HABPanel used the same idea),
 * clamped so short windows don't hammer the server and long ones still feel alive.
 */
export function autoRefreshSeconds(periodMs: number): number {
  return Math.min(900, Math.max(30, Math.round(periodMs / 1000 / 120)))
}

/**
 * Absorb bands too narrow to ever paint (sub-pixel at any realistic width) into their
 * predecessor, so a year of minute-resolution data doesn't become tens of thousands of DOM
 * nodes. The last band is always kept - it is the current state.
 */
export function thinBands(bands: TimelineBand[], minDuration: number): TimelineBand[] {
  if (minDuration <= 0 || bands.length === 0) return bands
  const out: TimelineBand[] = []
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]
    const prev = out[out.length - 1]
    if (i < bands.length - 1 && prev && b.end - b.start < minDuration) {
      prev.end = b.end
      continue
    }
    out.push({ ...b })
  }
  return out
}
