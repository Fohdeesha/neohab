import type { Item, ItemState } from '../../api/types'
import { lookup } from '../../model/lookup'
import { displayValue, numericValue, splitValueUnit } from '../common/format'
import { commandOr, finiteOr, stepDecimals } from '../common/itemControl'
import type { NumericScale } from '../common/itemControl'
import { sameCommand, snapToStep } from '../common/stepping'

export type ThermostatLook = 'arc' | 'dial' | 'disc' | 'ring'
export type HvacMode = 'heat' | 'cool' | 'other' | 'unknown'
export type FanMode = 'auto' | 'on' | 'other' | 'unknown'
export type Activity = 'heating' | 'cooling' | 'idle' | 'unknown'
export type Tone = 'heat' | 'cool' | 'neutral'

export interface ThermostatConfig {
  label?: string
  look?: ThermostatLook
  currentItem: string
  setpointItem: string
  modeItem?: string
  fanItem?: string
  auxItem?: string
  statusItem?: string
  min?: number
  max?: number
  step?: number
  unit?: string
  heatCommand?: string
  coolCommand?: string
  fanAutoCommand?: string
  fanOnCommand?: string
  auxOnCommand?: string
  auxOffCommand?: string
  heatingStates?: string
  coolingStates?: string
  heatColor?: string
  coolColor?: string
}

export const SEND_DELAY_MS = 350

export const DEFAULT_COMMANDS = {
  heat: 'HEAT',
  cool: 'COOL',
  fanAuto: 'AUTO',
  fanOn: 'ON',
  auxOn: 'ON',
  auxOff: 'OFF'
} as const
export const DEFAULT_HEATING_STATES = 'heating, HEATING, 1'
export const DEFAULT_COOLING_STATES = 'cooling, COOLING, 2'

const THERMO_LOOKS: Record<string, ThermostatLook> = { arc: 'arc', dial: 'dial', disc: 'disc', ring: 'ring' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export const DEFAULT_LOOK: ThermostatLook = 'arc'

export function lookOf(v: unknown): ThermostatLook {
  return lookup(THERMO_LOOKS, str(v)) ?? DEFAULT_LOOK
}

export const LOOK_FLOOR: Record<ThermostatLook, number> = { arc: 220, dial: 200, disc: 200, ring: 200 }
export const BAR_FLOOR = 44

export function floorOf(c: Partial<ThermostatConfig>): number {
  return LOOK_FLOOR[lookOf(c.look)] + (barOf(c).any ? BAR_FLOOR : 0)
}

export const LOOK_ARC: Record<ThermostatLook, { start: number; sweep: number }> = {
  arc: { start: 135, sweep: 270 },
  dial: { start: 135, sweep: 270 },
  disc: { start: 135, sweep: 270 },
  ring: { start: 135, sweep: 270 }
}

export function rampColor(fraction: number): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  return f <= 0.5
    ? `color-mix(in srgb, var(--th-mid) ${Math.round(f * 200)}%, var(--th-cool))`
    : `color-mix(in srgb, var(--th-heat) ${Math.round((f - 0.5) * 200)}%, var(--th-mid))`
}

export function draggable(look: ThermostatLook): boolean {
  return look !== 'ring'
}

export interface Reading {
  value?: number
  unit?: string
  text?: string
}

export function readTemp(state: ItemState | undefined): Reading {
  const value = numericValue(state)
  const split = splitValueUnit(displayValue(state, ''))
  const unit = typeof state?.unit === 'string' && state.unit !== '' ? state.unit : split.unit
  const text = value !== undefined && /^-?\d/.test(split.num) ? split.num : undefined
  return { value, unit, text }
}

export function isFahrenheit(unit: string | undefined): boolean {
  return typeof unit === 'string' && /f/i.test(unit)
}

export function unitOf(configured: unknown, ...reported: (string | undefined)[]): string | undefined {
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  return reported.find((u) => typeof u === 'string' && u !== '')
}

type RangeInput = { min?: unknown; max?: unknown; step?: unknown }

export function scaleOf(config: RangeInput, item: Item | undefined, unit: string | undefined): NumericScale {
  const f = isFahrenheit(unit)
  const dMin = f ? 50 : 10
  const dMax = f ? 90 : 30
  const dStep = f ? 1 : 0.5
  const sd = item?.stateDescription
  const min = finiteOr(config.min, finiteOr(sd?.minimum, dMin))
  const rawMax = finiteOr(config.max, finiteOr(sd?.maximum, dMax))
  const rawStep = finiteOr(config.step, finiteOr(sd?.step, dStep))
  return { min, max: rawMax > min ? rawMax : min + (dMax - dMin), step: rawStep > 0 ? rawStep : dStep }
}

export function hasOwnRange(config: RangeInput): boolean {
  return [config.min, config.max, config.step].every((v) => Number.isFinite(finiteOr(v, NaN)))
}

// a range somebody gave, on the widget or on the item; anything else is the built-in guess
export function rangeIsKnown(config: RangeInput, item: Item | undefined): boolean {
  const sd = item?.stateDescription
  const given = (own: unknown, fromItem: unknown) => Number.isFinite(finiteOr(own, finiteOr(fromItem, NaN)))
  return given(config.min, sd?.minimum) && given(config.max, sd?.maximum)
}

/**
 * Whether a press of + or - has nowhere to go. An unknown setpoint (NULL after a restart) has no
 * "one step up" at all, so both are refused rather than sending the minimum.
 */
export function stepBlocked(current: number | undefined, dir: 1 | -1, scale: NumericScale, rangeKnown: boolean): boolean {
  if (current === undefined || !Number.isFinite(current)) return true
  if (!rangeKnown && (current < scale.min || current > scale.max)) return false
  return dir > 0 ? current >= scale.max : current <= scale.min
}

// outside a guessed range the guess is what is wrong, so the setpoint moves one step from where it is
export function stepSetpoint(current: number, dir: 1 | -1, scale: NumericScale, rangeKnown: boolean): number {
  const next = snapToStep(current + dir * scale.step, scale.step)
  if (!rangeKnown && (current < scale.min || current > scale.max)) return next
  return Math.min(scale.max, Math.max(scale.min, next))
}

export function formatSetpoint(v: number | undefined, step: number): string {
  return v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(stepDecimals(step))
}

export function formatCurrent(r: Reading, step: number): string {
  if (r.value === undefined || !Number.isFinite(r.value)) return '-'
  const decimals = stepDecimals(step)
  if (r.text !== undefined) {
    const shown = Number(r.text)
    if (!Number.isFinite(shown) || Math.abs(shown - r.value) < Math.pow(10, -decimals) / 2 + 1e-9) return r.text
  }
  return r.value.toFixed(decimals)
}

export interface TempParts {
  int: string
  frac?: string
}

export function tempParts(text: string): TempParts {
  const m = /^(-?\d+)[.,](\d+)$/.exec(text)
  return m ? { int: m[1], frac: m[2] } : { int: text }
}

export function closeSetpoint(live: number | undefined, sent: number | undefined, step: number): boolean {
  if (live === undefined || sent === undefined) return live === sent
  return Math.abs(live - sent) <= Math.max(step, 0.5)
}

export function angleFor(fraction: number, arc: { start: number; sweep: number }): number {
  return arc.start + Math.min(1, Math.max(0, fraction)) * arc.sweep
}

export function angleOfPoint(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI
}

export function valueAtAngle(angleDeg: number, arc: { start: number; sweep: number }, scale: NumericScale): number {
  let a = angleDeg
  while (a < arc.start) a += 360
  while (a >= arc.start + 360) a -= 360
  if (a > arc.start + arc.sweep) a = a - (arc.start + arc.sweep) < (360 - arc.sweep) / 2 ? arc.start + arc.sweep : arc.start
  const raw = scale.min + ((a - arc.start) / arc.sweep) * (scale.max - scale.min)
  const snapped = snapToStep(Math.round(raw / scale.step) * scale.step, scale.step)
  return Math.min(scale.max, Math.max(scale.min, snapped))
}

export function onRing(distanceFraction: number, angleDeg: number, look: ThermostatLook): boolean {
  if (!draggable(look)) return false
  if (distanceFraction < (look === 'arc' ? 0.62 : 0.68) || distanceFraction > 1.15) return false
  const arc = LOOK_ARC[look]
  const slack = 6
  let a = angleDeg
  while (a < arc.start - slack) a += 360
  while (a >= arc.start - slack + 360) a -= 360
  return a <= arc.start + arc.sweep + slack
}

export function ticksOf(n: number, arc: { start: number; sweep: number }): number[] {
  if (n <= 1) return [arc.start]
  return Array.from({ length: n }, (_, i) => arc.start + (i / (n - 1)) * arc.sweep)
}

export function knownState(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== 'NULL' && raw !== 'UNDEF' && raw !== '' ? raw : undefined
}

export function sameState(a: string, b: string): boolean {
  return sameCommand(a, b) || a.trim().toLowerCase() === b.trim().toLowerCase()
}

export function parseStates(v: unknown): string[] {
  if (typeof v !== 'string') return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

export function commands(c: Partial<ThermostatConfig>) {
  return {
    heat: commandOr(c.heatCommand, DEFAULT_COMMANDS.heat),
    cool: commandOr(c.coolCommand, DEFAULT_COMMANDS.cool),
    fanAuto: commandOr(c.fanAutoCommand, DEFAULT_COMMANDS.fanAuto),
    fanOn: commandOr(c.fanOnCommand, DEFAULT_COMMANDS.fanOn),
    auxOn: commandOr(c.auxOnCommand, DEFAULT_COMMANDS.auxOn),
    auxOff: commandOr(c.auxOffCommand, DEFAULT_COMMANDS.auxOff)
  }
}

export function modeFrom(state: string | undefined, c: Partial<ThermostatConfig>): HvacMode {
  const s = knownState(state)
  if (s === undefined) return 'unknown'
  const cmd = commands(c)
  if (sameState(s, cmd.heat)) return 'heat'
  if (sameState(s, cmd.cool)) return 'cool'
  return 'other'
}

export function fanFrom(state: string | undefined, c: Partial<ThermostatConfig>): FanMode {
  const s = knownState(state)
  if (s === undefined) return 'unknown'
  const cmd = commands(c)
  if (sameState(s, cmd.fanAuto)) return 'auto'
  if (sameState(s, cmd.fanOn)) return 'on'
  return 'other'
}

export function auxFrom(state: string | undefined, c: Partial<ThermostatConfig>): boolean | undefined {
  const s = knownState(state)
  if (s === undefined) return undefined
  const cmd = commands(c)
  if (sameState(s, cmd.auxOn)) return true
  if (sameState(s, cmd.auxOff)) return false
  return undefined
}

export function activityFrom(state: string | undefined, c: Partial<ThermostatConfig>): Activity {
  const s = knownState(state)
  if (s === undefined) return 'unknown'
  const heating = parseStates(c.heatingStates ?? DEFAULT_HEATING_STATES)
  const cooling = parseStates(c.coolingStates ?? DEFAULT_COOLING_STATES)
  if (heating.some((h) => sameState(h, s))) return 'heating'
  if (cooling.some((k) => sameState(k, s))) return 'cooling'
  return 'idle'
}

export function toneOf(mode: HvacMode, activity: Activity): Tone {
  if (mode === 'heat') return 'heat'
  if (mode === 'cool') return 'cool'
  if (activity === 'heating') return 'heat'
  if (activity === 'cooling') return 'cool'
  return 'neutral'
}

export type StatusText = { kind: 'heating' | 'cooling' | 'idle' | 'heat' | 'cool' } | { kind: 'raw'; text: string } | { kind: 'none' }

export function statusOf(mode: HvacMode, activity: Activity, modeState: string | undefined): StatusText {
  if (activity === 'heating' || activity === 'cooling' || activity === 'idle') return { kind: activity }
  if (mode === 'heat' || mode === 'cool') return { kind: mode }
  const raw = knownState(modeState)
  if (mode === 'other' && raw !== undefined) return { kind: 'raw', text: raw }
  return { kind: 'none' }
}

export function colorOf(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

export function barOf(c: Partial<ThermostatConfig>): { mode: boolean; fan: boolean; aux: boolean; any: boolean } {
  const bound = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  const mode = bound(c.modeItem)
  const fan = bound(c.fanItem)
  const aux = bound(c.auxItem)
  return { mode, fan, aux, any: mode || fan || aux }
}
