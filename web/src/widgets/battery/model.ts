import type { ItemState } from '../../api/types'
import { lookup } from '../../model/lookup'
import { finiteOr } from '../common/itemControl'
import { isOn } from '../common/format'

export type BatteryStyle = 'glow' | 'neon' | 'cells' | 'ring' | 'pods' | 'bar' | 'wave' | 'meter'
export type BatteryColorMode = 'level' | 'accent'
export type BatteryLevel = 'good' | 'mid' | 'low'

export interface BatteryConfig {
  item: string
  label?: string
  style?: BatteryStyle
  showText?: boolean
  min?: number
  max?: number
  colorMode?: BatteryColorMode
  lowBelow?: number
  midBelow?: number
  chargingItem?: string
  caption?: string
  icon?: string
  animate?: boolean
}

const STYLES: Record<string, BatteryStyle> = {
  glow: 'glow',
  neon: 'neon',
  cells: 'cells',
  ring: 'ring',
  pods: 'pods',
  bar: 'bar',
  wave: 'wave',
  meter: 'meter'
}
const COLOR_MODES: Record<string, BatteryColorMode> = { level: 'level', accent: 'accent' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function styleOf(v: unknown): BatteryStyle {
  return lookup(STYLES, str(v)) ?? 'neon'
}
export function colorModeOf(v: unknown): BatteryColorMode {
  return lookup(COLOR_MODES, str(v)) ?? 'level'
}
export function showTextOf(v: unknown): boolean {
  return v !== false
}
export function animateOf(v: unknown): boolean {
  return v !== false
}

export interface InputRange {
  min: number
  max: number
}

// the item's own scale: whatever it reports as empty and as full. A range that cannot hold a value
// (max at or below min) falls back to a span of 100 above the minimum rather than dividing by zero
export function inputRange(min: unknown, max: unknown): InputRange {
  const lo = finiteOr(min, 0)
  const hi = finiteOr(max, 100)
  return { min: lo, max: hi > lo ? hi : lo + 100 }
}

export function percentOf(value: number | undefined, range: InputRange): number | null {
  if (value === undefined || !Number.isFinite(value)) return null
  const pct = ((value - range.min) * 100) / (range.max - range.min)
  return Math.min(100, Math.max(0, pct))
}

export interface Thresholds {
  low: number
  mid: number
}

export function thresholdsOf(lowBelow: unknown, midBelow: unknown): Thresholds {
  const clamp = (n: number) => Math.min(100, Math.max(0, n))
  const low = clamp(finiteOr(lowBelow, 20))
  const mid = Math.max(low, clamp(finiteOr(midBelow, 45)))
  return { low, mid }
}

export function levelOf(pct: number | null, th: Thresholds): BatteryLevel | null {
  if (pct === null) return null
  if (pct < th.low) return 'low'
  if (pct < th.mid) return 'mid'
  return 'good'
}

export function displayPercent(pct: number | null): string {
  return pct === null ? '-' : String(Math.round(pct))
}

// a Switch says ON, a Contact says OPEN, and a Number or Dimmer says something above zero
export function chargingOf(state: ItemState | undefined): boolean {
  if (!state) return false
  if (state.state === 'OPEN') return true
  return isOn(state)
}

export type CellState = 'full' | 'part' | 'empty'

// bottom cell first
export function cellStates(pct: number, n: number): CellState[] {
  const out: CellState[] = []
  for (let i = 0; i < n; i++) {
    const from = (i / n) * 100
    const to = ((i + 1) / n) * 100
    out.push(pct >= to ? 'full' : pct > from ? 'part' : 'empty')
  }
  return out
}

export function litCount(pct: number, n: number): number {
  return Math.min(n, Math.max(0, Math.round((n * pct) / 100)))
}

export const RING_TICKS = 48

export const METER_MAX = 20
export const METER_MIN = 8

export function meterCount(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return METER_MIN
  return Math.min(METER_MAX, Math.max(METER_MIN, Math.floor(width / 11)))
}

// the fade at the top of a pods fill is a fixed depth, so a low level still shows a solid band
export function podFadeStop(fillH: number, podW: number): number {
  if (!(fillH > 0)) return 0
  const fade = Math.min(fillH * 0.5, podW * 0.45)
  return fade / fillH
}

// one wave across three vessel widths, so it can scroll one period (half a width) and still cover the vessel
export function wavePath(gw: number, gh: number, level: number, amp: number, shift: number, lift = 0): string {
  const f = (n: number) => (Math.round(n * 10) / 10).toString()
  const wl = gw / 2
  let d = `M${f(-gw + shift)},${f(level - lift)}`
  for (let x = -gw + shift; x < gw * 2; x += wl) {
    d += ` q${f(wl / 4)},${f(-amp)} ${f(wl / 2)},0 t${f(wl / 2)},0`
  }
  d += ` V${f(gh + 10)} H${f(-gw - 10)} Z`
  return d
}
