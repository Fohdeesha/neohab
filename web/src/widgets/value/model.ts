import { lookup } from '../../model/lookup'
import { finiteOr } from '../common/itemControl'
import type { SeverityStop } from '../dial/gauge'
import type { StateIconRule } from '../common/stateIcon'

export type ValueStyle = 'plain' | 'stat' | 'spark' | 'split' | 'bar' | 'segment' | 'pill' | 'hero'
export type ValueAlign = 'left' | 'center' | 'right'
export type TrendDirection = 'up' | 'down' | 'flat'
export type TrendTone = 'good' | 'bad' | 'neutral'

export interface ValueConfig {
  item: string
  label?: string
  unit?: string
  caption?: string
  style?: ValueStyle
  align?: ValueAlign
  color?: string
  severity?: SeverityStop[]
  badge?: string
  badgeColor?: string
  trend?: 'none' | 'history' | 'item'
  trendPeriod?: string
  trendItem?: string
  goodDirection?: 'up' | 'down' | 'none'
  subItem?: string
  subText?: string
  subCaption?: string
  icon?: string
  iconColor?: string
  iconSize?: number
  stateIcons?: StateIconRule[]
  min?: number
  max?: number
}

const STYLES: Record<string, ValueStyle> = {
  plain: 'plain',
  stat: 'stat',
  spark: 'spark',
  split: 'split',
  bar: 'bar',
  segment: 'segment',
  pill: 'pill',
  hero: 'hero'
}

const ALIGNS: Record<string, ValueAlign> = { left: 'left', center: 'center', right: 'right' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function styleOf(v: unknown): ValueStyle {
  return lookup(STYLES, str(v)) ?? 'plain'
}

export function alignOf(v: unknown): ValueAlign {
  return lookup(ALIGNS, str(v)) ?? 'left'
}

// the column looks are the ones an alignment can move; plain, pill and hero centre themselves
export function alignable(style: ValueStyle): boolean {
  return style === 'stat' || style === 'spark' || style === 'bar' || style === 'segment'
}

// spark draws the window whether or not an arrow is asked for, so history is fetched for either
export function wantsHistory(config: { style?: unknown; trend?: unknown; item?: unknown }): boolean {
  if (typeof config.item !== 'string' || config.item === '') return false
  return config.trend === 'history' || styleOf(config.style) === 'spark'
}

export const VALUE_PERIODS: Record<string, number> = {
  '1h': 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000
}

export function statPeriodMs(period: string | undefined): number {
  return lookup(VALUE_PERIODS, period) ?? VALUE_PERIODS['24h']
}

const DEADBAND = 0.005

export function trendDirection(current: number, reference: number): TrendDirection | null {
  if (!Number.isFinite(current) || !Number.isFinite(reference)) return null
  const delta = current - reference
  if (Math.abs(delta) <= Math.abs(reference) * DEADBAND) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

export function trendTone(direction: TrendDirection, good: string | undefined): TrendTone {
  if (direction === 'flat' || (good !== 'up' && good !== 'down')) return 'neutral'
  return direction === good ? 'good' : 'bad'
}

export function referenceValue(points: { time: number; value: number }[], t0: number): number | undefined {
  let best: number | undefined
  for (const p of points) {
    if (!Number.isFinite(p?.value) || !Number.isFinite(p?.time)) continue
    if (p.time <= t0) best = p.value
    else if (best === undefined) return p.value // series begins after t0: its first known value
    else break
  }
  return best
}

// a max at or below min falls back to a span of 100 rather than dividing by zero
export function barFraction(value: number | undefined, min: unknown, max: unknown): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  const lo = finiteOr(min, 0)
  const hiRaw = finiteOr(max, 100)
  const hi = hiRaw > lo ? hiRaw : lo + 100
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)))
}

// a fixed 0..100 box the svg stretches, so the look needs no measurement of its own. A flat series
// has no span to scale against and is drawn along the middle rather than divided by a zero range.
export function sparkPath(points: { time: number; value: number }[]): string {
  const usable = points.filter((p) => Number.isFinite(p?.value) && Number.isFinite(p?.time))
  if (usable.length === 0) return ''
  const times = usable.map((p) => p.time)
  const values = usable.map((p) => p.value)
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const v0 = Math.min(...values)
  const v1 = Math.max(...values)
  const tSpan = t1 - t0
  const vSpan = v1 - v0
  const f = (n: number) => (Math.round(n * 100) / 100).toString()
  const x = (t: number) => (tSpan > 0 ? ((t - t0) / tSpan) * 100 : 50)
  const y = (v: number) => (vSpan > 0 ? 100 - ((v - v0) / vSpan) * 100 : 50)
  if (usable.length === 1) return `M0,${f(y(values[0]))} L100,${f(y(values[0]))}`
  return usable.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(x(p.time))},${f(y(p.value))}`).join(' ')
}

export function sparkArea(line: string): string {
  return line === '' ? '' : `${line} L100,100 L0,100 Z`
}
