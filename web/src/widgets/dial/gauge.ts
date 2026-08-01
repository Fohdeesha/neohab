/**
 * Pure geometry and lighting model for the dial widget's LED gauge style. No React, no DOM -
 * everything here is unit-testable arithmetic. The rendering in index.tsx and the settings
 * form both read from these helpers so the drawn gauge and the stored config cannot drift.
 *
 * Angle convention: user-facing angles (arc start) are degrees from 12 o'clock, clockwise -
 * the way a person describes a clock face. SVG measures from 3 o'clock, so {@link valueToAngle}
 * returns SVG degrees (top-based minus 90).
 */

export interface SeverityStop {
  /** The stop applies to values up to and including this. */
  value?: number
  color?: string
}

export interface GaugeMarker {
  /** Fixed position, used when no item is bound. */
  value?: number
  /** Live position: the marker follows this item's numeric state. */
  item?: string
  color?: string
  label?: string
}

export interface GaugeZone {
  from?: number
  to?: number
  color?: string
}

/** The ring-drawn gauge styles ('classic' is the original arc slider, drawn elsewhere). */
export type RingStyle = 'led' | 'arc' | 'blocks' | '3d'

export interface DialConfig {
  item: string
  label?: string
  /**
   * Visual style: 'classic' = the original arc slider; 'led' = glowing bead ring;
   * 'arc' = continuous solid band with a sector face; 'blocks' = chunky flat segments;
   * '3d' = clay-shaded blocks and arc.
   */
  style?: 'classic' | RingStyle
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Display-only gauge: shows the value but never sends commands. */
  readOnly?: boolean
  /* ── LED style ── */
  /** Base LED color when no severity stop matches; empty follows the theme. */
  color?: string
  ledCount?: number
  /** Visible arc in degrees (30-360). 360 = full circle, 180 = half gauge. */
  arcSweep?: number
  /** Where the arc begins, degrees from 12 o'clock clockwise. */
  arcStart?: number
  severity?: SeverityStop[]
  /** Soft colored glow filling the gauge interior. */
  bloom?: boolean
  hideUnlit?: boolean
  /** Fill from zero (or the range midpoint) instead of from the arc start. */
  bidirectional?: boolean
  showTicks?: boolean
  tickSteps?: number
  showTickLabels?: boolean
  markers?: GaugeMarker[]
  zones?: GaugeZone[]
  alarm?: boolean
  alarmFrom?: number
  alarmTo?: number
  /** Mini history bar-chart under the center value, fed from persistence. */
  history?: boolean
  /** Window for the history bars, e.g. '24h'. */
  historyPeriod?: string
  /* ── second (inner) ring: set item2 and the LED gauge becomes a dual gauge ── */
  item2?: string
  min2?: number
  max2?: number
  step2?: number
  unit2?: string
  color2?: string
  severity2?: SeverityStop[]
  bidirectional2?: boolean
  /** Which ring's value renders large in the center; the other renders smaller beneath. */
  centerShows?: 'outer' | 'inner'
}

/** Whether a second (inner) ring is configured. */
export function hasInnerRing(c: DialConfig): boolean {
  return typeof c.item2 === 'string' && c.item2 !== ''
}

/**
 * The color a ring shows for a value: a matching severity stop wins, else the ring's own
 * configured color, else undefined and the renderer falls back to the theme primary.
 */
export function gaugeColor(
  value: number,
  stops: SeverityStop[] | undefined,
  base: string | undefined,
): string | undefined {
  return severityColor(value, stops) ?? (typeof base === 'string' && base !== '' ? base : undefined)
}

/**
 * Which ring a pointer addresses, by its distance from center in viewBox units: whichever
 * ring radius is nearer. The ring is picked once at pointer-down and held for the gesture.
 */
export function pickRing(radius: number, outerR: number, innerR: number): 'outer' | 'inner' {
  return radius >= (outerR + innerR) / 2 ? 'outer' : 'inner'
}

/**
 * Stored configuration that did not come from the editor is untrusted input (backups, hand
 * edits, partial imports are written verbatim), so every value used for arithmetic gets its
 * guard at the read.
 */
function finite(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

export const LED_COUNT_DEFAULT = 60
/** Chunky segments read as blocks only when there are few of them. */
export const BLOCK_COUNT_DEFAULT = 20

export function ledCountOf(c: DialConfig): number {
  const fallback = c.style === 'blocks' || c.style === '3d' ? BLOCK_COUNT_DEFAULT : LED_COUNT_DEFAULT
  return Math.round(Math.min(200, Math.max(8, finite(c.ledCount, fallback))))
}

export function arcOf(c: DialConfig): { start: number; sweep: number } {
  const sweep = Math.min(360, Math.max(30, finite(c.arcSweep, 360)))
  let start = finite(c.arcStart, 0) % 360
  if (start < 0) start += 360
  return { start, sweep }
}

/** Fraction of value within [min, max], clamped to [0, 1]. A degenerate range reads as 0. */
export function fractionOf(value: number, min: number, max: number): number {
  if (!(max > min)) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

/**
 * The bidirectional reference: zero when the range straddles it, else the midpoint - the same
 * rule for lighting and for the tick that marks it.
 */
export function zeroFractionOf(min: number, max: number, bidirectional: boolean): number {
  if (!bidirectional) return 0
  const ref = min <= 0 && max >= 0 ? 0 : (min + max) / 2
  return fractionOf(ref, min, max)
}

/** SVG angle (degrees, 0 = 3 o'clock, clockwise) for a fraction along the arc. */
export function fractionToAngle(frac: number, start: number, sweep: number): number {
  return start + frac * sweep - 90
}

/**
 * Placement fraction of LED i: a full circle spaces by i/n so the first and last LED do not
 * coincide at the seam; a partial arc spaces by i/(n-1) so the last LED sits exactly at the
 * arc's end instead of one slot shy of it.
 */
export function ledFraction(i: number, count: number, sweep: number): number {
  if (count <= 1) return 0
  return sweep >= 360 ? i / count : i / (count - 1)
}

/**
 * Whether LED i is lit for the value. Unidirectional lights from the arc start up to the
 * value; bidirectional lights between the zero reference and the value, with the reference
 * LED always lit as the resting point.
 */
export function ledLit(
  i: number,
  count: number,
  sweep: number,
  valueFrac: number,
  zeroFrac: number,
  bidirectional: boolean,
): boolean {
  const f = ledFraction(i, count, sweep)
  const eps = 1e-9
  if (!bidirectional) return valueFrac > 0 && f <= valueFrac + eps
  const lo = Math.min(valueFrac, zeroFrac)
  const hi = Math.max(valueFrac, zeroFrac)
  // the reference LED stays lit even at rest; ledFraction is quantized, so mark the nearest slot
  const slot = 1 / (sweep >= 360 ? count : Math.max(1, count - 1))
  if (Math.abs(f - zeroFrac) <= slot / 2 + eps) return true
  return f >= lo - eps && f <= hi + eps
}

/**
 * Whether block segment i is lit. Blocks span an angular range rather than sitting at a
 * point, so the MIDPOINT fraction decides - i/count would light one block too many at any
 * value. Same bidirectional semantics as {@link ledLit}, with the reference block being the
 * one whose span contains the zero fraction.
 */
export function blockLit(
  i: number,
  count: number,
  valueFrac: number,
  zeroFrac: number,
  bidirectional: boolean,
): boolean {
  const f = (i + 0.5) / count
  const eps = 1e-9
  if (!bidirectional) return valueFrac > 0 && f <= valueFrac + eps
  const lo = Math.min(valueFrac, zeroFrac)
  const hi = Math.max(valueFrac, zeroFrac)
  // the reference block is the one whose SPAN contains the zero fraction - a midpoint-distance
  // rule would light both neighbours when zero sits exactly on a block edge
  if (i === Math.min(count - 1, Math.floor(zeroFrac * count))) return true
  return f >= lo - eps && f <= hi + eps
}

/**
 * Severity color for a value: stops sorted by threshold, the first stop whose threshold is at
 * or above the value applies; a value above every stop keeps the last (highest) stop's color.
 * No usable stops - undefined, and the renderer falls back to the theme's primary color.
 */
export function severityColor(value: number, stops: SeverityStop[] | undefined): string | undefined {
  // stored config is untrusted: a hand edit can put anything here, and .filter on it would throw
  const usable = (Array.isArray(stops) ? stops : [])
    .filter((s): s is { value: number; color: string } => Number.isFinite(s?.value as number) && typeof s?.color === 'string' && s.color !== '')
    .sort((a, b) => a.value - b.value)
  if (usable.length === 0) return undefined
  for (const s of usable) if (value <= s.value) return s.color
  return usable[usable.length - 1].color
}

export interface GaugeTick {
  angle: number
  major: boolean
  label?: string
}

/** Tick marks along the arc: majors at each step (labelled), one minor between each pair. */
export function gaugeTicks(
  min: number,
  max: number,
  start: number,
  sweep: number,
  majorSteps: number,
  decimals: number,
  labels: boolean,
): GaugeTick[] {
  const steps = Math.round(Math.min(20, Math.max(1, finite(majorSteps, 5))))
  const minor = steps * 2
  const ticks: GaugeTick[] = []
  // a full circle would put the last tick on top of the first - drop it there
  const last = sweep >= 360 ? minor - 1 : minor
  for (let i = 0; i <= last; i++) {
    const major = i % 2 === 0
    ticks.push({
      angle: fractionToAngle(i / minor, start, sweep),
      major,
      // String(Number(...)) drops trailing zeros - "-40", not "-40.0" - scale labels need
      // the coarse number, and the width matters at the viewBox edges
      label: major && labels ? String(Number((min + (i / minor) * (max - min)).toFixed(decimals))) : undefined,
    })
  }
  return ticks
}

/**
 * Inverse of the value-angle mapping for pointer interaction: an SVG-space pointer angle
 * mapped to the nearest value on the arc, snapped to the step's own precision. Angles in the
 * arc's dead gap clamp to whichever end is angularly closer.
 */
export function angleToValue(
  svgAngle: number,
  min: number,
  max: number,
  start: number,
  sweep: number,
  step: number,
  decimals: number,
): number {
  // back to degrees-from-top-clockwise, normalized relative to the arc start
  let rel = (svgAngle + 90 - start) % 360
  if (rel < 0) rel += 360
  let frac: number
  if (rel <= sweep) {
    frac = rel / sweep
  } else {
    // in the gap: distance past the end vs distance short of the start
    frac = rel - sweep < (360 - rel) ? 1 : 0
  }
  const raw = min + frac * (max - min)
  const snapped = Number((Math.round(raw / step) * step).toFixed(decimals))
  return Math.min(max, Math.max(min, snapped))
}

export const HISTORY_PERIODS: Record<string, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '12h': 12 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
}

export function historyPeriodMs(c: DialConfig): number {
  return HISTORY_PERIODS[c.historyPeriod ?? ''] ?? HISTORY_PERIODS['24h']
}

/**
 * Buckets a history series into bar heights normalized 0..1 across the bars themselves.
 *
 * Each stored sample is treated as holding until the next one (sample-and-hold), and each
 * bucket reports the TIME-WEIGHTED mean of the value in force - a plain mean of the stored
 * rows would let change-based persistence skew a bucket (the chart decimation lesson). A
 * bucket before the first sample has no data and returns null. A flat series normalizes to
 * 0.5 so it still draws as half-height bars rather than vanishing.
 */
export function historyBars(
  points: { time: number; value: number }[],
  t0: number,
  t1: number,
  buckets: number,
): (number | null)[] {
  const n = Math.round(Math.min(120, Math.max(1, finite(buckets, 24))))
  if (!(t1 > t0)) return Array(n).fill(null)
  const pts = points
    .filter((p) => Number.isFinite(p?.value) && Number.isFinite(p?.time))
    .sort((a, b) => a.time - b.time)
  const width = (t1 - t0) / n
  const means: (number | null)[] = []
  for (let b = 0; b < n; b++) {
    const bStart = t0 + b * width
    const bEnd = bStart + width
    let weighted = 0
    let covered = 0
    for (let i = 0; i < pts.length; i++) {
      const holdStart = pts[i].time
      const holdEnd = i + 1 < pts.length ? pts[i + 1].time : t1
      const from = Math.max(bStart, holdStart)
      const to = Math.min(bEnd, holdEnd)
      if (to > from) {
        weighted += pts[i].value * (to - from)
        covered += to - from
      }
      if (holdStart >= bEnd) break
    }
    means.push(covered > 0 ? weighted / covered : null)
  }
  const seen = means.filter((m): m is number => m !== null)
  if (seen.length === 0) return means
  const lo = Math.min(...seen)
  const hi = Math.max(...seen)
  return means.map((m) => (m === null ? null : hi > lo ? (m - lo) / (hi - lo) : 0.5))
}

/** Whether the value sits inside the configured alarm range (inclusive). */
export function inAlarm(c: DialConfig, value: number, min: number, max: number): boolean {
  if (!c.alarm) return false
  const from = finite(c.alarmFrom, min)
  const to = finite(c.alarmTo, max)
  return value >= Math.min(from, to) && value <= Math.max(from, to)
}
