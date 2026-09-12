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
  colorMaps?: TimelineColorMap[]
  label?: string
  period?: string
  service?: string
  refresh?: number
  picker?: boolean
  periods?: string[]
}

export interface TimelineBand {
  state: string
  start: number
  end: number
}

const GAP_STATES = new Set(['NULL', 'UNDEF', ''])

export function effectiveTimelineSeries(config: TimelineConfig): TimelineSeries[] {
  const stored = Array.isArray(config.series) ? config.series : []
  return stored.filter((s) => s && typeof s.item === 'string' && s.item !== '')
}

export function effectiveColorMaps(config: TimelineConfig): TimelineColorMap[] {
  const stored = Array.isArray(config.colorMaps) ? config.colorMaps : []
  return stored.filter((m) => m && typeof m.state === 'string' && m.state !== '' && typeof m.color === 'string' && m.color !== '')
}

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
  return bands
    .filter((b) => b.end > windowStart && !GAP_STATES.has(b.state))
    .map((b) => (b.start < windowStart ? { ...b, start: windowStart } : b))
}

const MINUTE_SPAN = 3 * 3600e3
const DAY_SPAN = 48 * 3600e3

/**
 * The clock under the bands. Ticks sit a third of the window apart, so minutes only say anything
 * over a few hours - and printing them anyway is what ran "10:19 AM06:19 PM02:19 AM" together on a
 * phone.
 */
export function axisTick(ms: number, spanMs: number): string {
  const d = new Date(ms)
  if (spanMs > DAY_SPAN) return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  if (spanMs <= MINUTE_SPAN) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleTimeString([], { hour: 'numeric' })
}

export function autoRefreshSeconds(periodMs: number): number {
  return Math.min(900, Math.max(30, Math.round(periodMs / 1000 / 120)))
}

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
