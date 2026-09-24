import { finiteOr as finite, numericScale, type NumericScale } from '../common/itemControl'
import { lookup } from '../../model/lookup'

export interface SeverityStop {
  value?: number
  color?: string
}

export interface GaugeMarker {
  value?: number
  item?: string
  color?: string
  label?: string
}

export interface GaugeZone {
  from?: number
  to?: number
  color?: string
}

export type RingStyle = 'led' | 'ticks' | 'arc' | 'blocks' | '3d'

export interface DialConfig {
  item: string
  label?: string
  liveDrag?: string
  icon?: string
  iconColor?: string
  iconSize?: number
  style?: 'classic' | RingStyle
  centerLabel?: boolean
  min?: number
  max?: number
  step?: number
  unit?: string
  showMax?: boolean
  readOnly?: boolean
  color?: string
  ledCount?: number
  arcSweep?: number
  arcStart?: number
  severity?: SeverityStop[]
  bloom?: boolean
  hideUnlit?: boolean
  bidirectional?: boolean
  showTicks?: boolean
  tickSteps?: number
  showTickLabels?: boolean
  markers?: GaugeMarker[]
  zones?: GaugeZone[]
  alarm?: boolean
  alarmFrom?: number
  alarmTo?: number
  history?: boolean
  historyPeriod?: string
  historyStyle?: 'bars' | 'line'
  item2?: string
  min2?: number
  max2?: number
  step2?: number
  unit2?: string
  color2?: string
  severity2?: SeverityStop[]
  bidirectional2?: boolean
  centerShows?: 'outer' | 'inner'
}

export function hasInnerRing(c: DialConfig): boolean {
  return typeof c.item2 === 'string' && c.item2 !== ''
}

export function gaugeColor(value: number, stops: SeverityStop[] | undefined, base: string | undefined): string | undefined {
  return severityColor(value, stops) ?? (typeof base === 'string' && base !== '' ? base : undefined)
}

export function pickRing(radius: number, outerR: number, innerR: number): 'outer' | 'inner' {
  return radius >= (outerR + innerR) / 2 ? 'outer' : 'inner'
}

export type GaugeScale = NumericScale

export function scaleOf(c: DialConfig, ring: 'outer' | 'inner' = 'outer'): GaugeScale {
  return ring === 'inner' ? numericScale(c.min2, c.max2, c.step2) : numericScale(c.min, c.max, c.step)
}

export const LED_COUNT_DEFAULT = 60
export const BLOCK_COUNT_DEFAULT = 20

export function ledCountOf(c: DialConfig): number {
  const fallback = c.style === 'blocks' || c.style === '3d' ? BLOCK_COUNT_DEFAULT : LED_COUNT_DEFAULT
  return Math.round(Math.min(200, Math.max(8, finite(c.ledCount, fallback))))
}

export function arcOf(c: DialConfig): { start: number; sweep: number } {
  const sweep = Math.min(360, Math.max(30, finite(c.arcSweep, 360)))
  const start = ((finite(c.arcStart, 0) % 360) + 360) % 360
  return { start, sweep }
}

export function fractionOf(value: number, min: number, max: number): number {
  if (!(max > min)) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

export function zeroFractionOf(min: number, max: number, bidirectional: boolean): number {
  if (!bidirectional) return 0
  const ref = min <= 0 && max >= 0 ? 0 : (min + max) / 2
  return fractionOf(ref, min, max)
}

export function fractionToAngle(frac: number, start: number, sweep: number): number {
  return start + frac * sweep - 90
}

export function ledFraction(i: number, count: number, sweep: number): number {
  if (count <= 1) return 0
  return sweep >= 360 ? i / count : i / (count - 1)
}

export function ledLit(i: number, count: number, sweep: number, valueFrac: number, zeroFrac: number, bidirectional: boolean): boolean {
  const f = ledFraction(i, count, sweep)
  const eps = 1e-9
  if (!bidirectional) return valueFrac > 0 && f <= valueFrac + eps
  const lo = Math.min(valueFrac, zeroFrac)
  const hi = Math.max(valueFrac, zeroFrac)
  const slot = 1 / (sweep >= 360 ? count : Math.max(1, count - 1))
  if (Math.abs(f - zeroFrac) <= slot / 2 + eps) return true
  return f >= lo - eps && f <= hi + eps
}

export function blockLit(i: number, count: number, valueFrac: number, zeroFrac: number, bidirectional: boolean): boolean {
  const f = (i + 0.5) / count
  const eps = 1e-9
  if (!bidirectional) return valueFrac > 0 && f <= valueFrac + eps
  const lo = Math.min(valueFrac, zeroFrac)
  const hi = Math.max(valueFrac, zeroFrac)
  if (i === Math.min(count - 1, Math.floor(zeroFrac * count))) return true
  return f >= lo - eps && f <= hi + eps
}

export function severityColor(value: number, stops: SeverityStop[] | undefined): string | undefined {
  const usable = (Array.isArray(stops) ? stops : [])
    .filter(
      (s): s is { value: number; color: string } => Number.isFinite(s?.value as number) && typeof s?.color === 'string' && s.color !== ''
    )
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

export function gaugeTicks(
  min: number,
  max: number,
  start: number,
  sweep: number,
  majorSteps: number,
  decimals: number,
  labels: boolean
): GaugeTick[] {
  const steps = Math.round(Math.min(20, Math.max(1, finite(majorSteps, 5))))
  const minor = steps * 2
  const ticks: GaugeTick[] = []
  const last = sweep >= 360 ? minor - 1 : minor
  for (let i = 0; i <= last; i++) {
    const major = i % 2 === 0
    ticks.push({
      angle: fractionToAngle(i / minor, start, sweep),
      major,
      label: major && labels ? String(Number((min + (i / minor) * (max - min)).toFixed(decimals))) : undefined
    })
  }
  return ticks
}

export const HISTORY_PERIODS: Record<string, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '12h': 12 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000
}

export function historyPeriodMs(c: DialConfig): number {
  return lookup(HISTORY_PERIODS, c.historyPeriod) ?? HISTORY_PERIODS['24h']
}

export function historyBars(points: { time: number; value: number }[], t0: number, t1: number, buckets: number): (number | null)[] {
  const n = Math.round(Math.min(120, Math.max(1, finite(buckets, 24))))
  if (!(t1 > t0)) return Array(n).fill(null)
  const pts = points.filter((p) => Number.isFinite(p?.value) && Number.isFinite(p?.time)).sort((a, b) => a.time - b.time)
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

export function sparkSegments(values: (number | null)[], x0: number, width: number, yBase: number, height: number): string[] {
  const n = values.length
  if (n === 0 || !(width > 0)) return []
  const stepX = n > 1 ? width / (n - 1) : 0
  const at = (i: number, v: number) => `${(x0 + i * stepX).toFixed(2)} ${(yBase - v * height).toFixed(2)}`
  const out: string[] = []
  let run: string[] = []
  const flush = () => {
    if (run.length === 1) out.push(`M ${run[0]} l ${(stepX * 0.5).toFixed(2)} 0`)
    else if (run.length > 1) out.push('M ' + run.join(' L '))
    run = []
  }
  for (let i = 0; i < n; i++) {
    const v = values[i]
    if (v === null || !Number.isFinite(v)) flush()
    else run.push(at(i, v))
  }
  flush()
  return out
}

export function inAlarm(c: DialConfig, value: number, min: number, max: number): boolean {
  if (!c.alarm) return false
  const from = finite(c.alarmFrom, min)
  const to = finite(c.alarmTo, max)
  return value >= Math.min(from, to) && value <= Math.max(from, to)
}
