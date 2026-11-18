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
  labelMode?: string
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
  const bands = bandBuilder(windowStart, now, 0)
  bands.take(points)
  return bands.finish()
}

export interface BandBuilder {
  take(points: HistoryPoint[]): void
  finish(): TimelineBand[]
}

/**
 * The bands of a window, built as its points arrive, so a long window of a busy item is never held: runs of
 * one state become one band, gaps and whatever ended before the window are left out, and a band shorter
 * than `minDuration` is folded into the one before it (thinBands), except the first and the last.
 */
export function bandBuilder(windowStart: number, now: number, minDuration: number): BandBuilder {
  const out: TimelineBand[] = []
  // the newest band so far. The last band is never thinned away, and until another follows this may be it
  let newest: TimelineBand | undefined
  let state: string | null = null
  let start = 0
  let past = false
  const settle = (band: TimelineBand): void => {
    const prev = out[out.length - 1]
    if (minDuration > 0 && prev && band.end - band.start < minDuration) prev.end = band.end
    else out.push(band)
  }
  const close = (end: number): void => {
    if (state === null || !(end > windowStart) || GAP_STATES.has(state)) return
    if (newest) settle(newest)
    newest = { state, start: start < windowStart ? windowStart : start, end }
  }
  return {
    take(points) {
      if (past) return
      for (const p of points) {
        if (p.time > now) {
          past = true
          return
        }
        if (state === null) {
          state = p.state
          start = p.time
        } else if (p.state !== state) {
          close(p.time)
          state = p.state
          start = p.time
        }
      }
    },
    finish() {
      close(now)
      state = null
      if (newest) out.push(newest)
      newest = undefined
      return out
    }
  }
}

const MINUTE_SPAN = 3 * 3600e3
const DAY_SPAN = 48 * 3600e3

/**
 * The clock under the bands. Ticks sit a third of the window apart, so minutes only say anything
 * over a few hours - and printing them anyway is what ran "10:19 AM06:19 PM02:19 AM" together on a
 * phone.
 */
export function axisTick(ms: number, spanMs: number, locale?: string): string {
  const d = new Date(ms)
  if (spanMs > DAY_SPAN) return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  if (spanMs <= MINUTE_SPAN) return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleTimeString(locale, { hour: 'numeric' })
}

/**
 * A refetch answers what persistence held when it was asked, so a band the live updates opened after
 * that moment is not in the answer - and replacing the rows with it wiped a change seconds old.
 */
export function keepLiveTail(fresh: TimelineBand[], shown: TimelineBand[] | undefined, askedAt: number): TimelineBand[] {
  const tail = (shown ?? []).filter((b) => b.start > askedAt)
  if (tail.length === 0) return fresh
  const last = fresh[fresh.length - 1]
  // the refetch caught the change the live band shows, so the server's account of when it happened stands
  if (last && last.state === tail[0].state) return [...fresh.slice(0, -1), { ...last, end: tail[0].end }, ...tail.slice(1)]
  const closed = last ? [...fresh.slice(0, -1), { ...last, end: tail[0].start }] : fresh
  return [...closed, ...tail]
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
