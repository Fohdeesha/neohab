/**
 * The thermostat's pure half: how a stored configuration is read, what a press or a drag on
 * the ring does to the setpoint, and what the items' states mean. Nothing here touches React
 * or the DOM, so every rule is unit-checked in isolation.
 *
 * A thermostat is several items at once: the room's temperature (read only), the setpoint
 * (commanded), and optionally the mode (heat or cool), the fan (auto or on), auxiliary heat
 * (on or off) and a status item saying what the system is doing right now. openHAB bindings
 * disagree about the words for all of those - Nest says HEAT, Ecobee says heat, a Z-Wave
 * thermostat says 1 - so every command and every recognised state is a setting with a default,
 * and matching is case-insensitive and numerically tolerant.
 *
 * Everything read out of the configuration is guarded: a look nobody spelled right, a step of
 * zero, a colour that is not a string - all land on a usable default rather than on NaN or a
 * thrown render.
 */
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
/** Which of the two colours the face is drawn in, or neither. */
export type Tone = 'heat' | 'cool' | 'neutral'

export interface ThermostatConfig {
  label?: string
  /** The layout: the arc with buttons, the solid dial, the disc with markers, or the ring. */
  look?: ThermostatLook
  /** The room's temperature. Read only. */
  currentItem: string
  /** The target temperature. Commanded by the buttons and the ring. */
  setpointItem: string
  modeItem?: string
  fanItem?: string
  auxItem?: string
  /** What the system is doing now (heating, cooling, idle), when the thermostat reports it. */
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
  /** Comma-separated states of the status item that mean the system is heating / cooling. */
  heatingStates?: string
  coolingStates?: string
  heatColor?: string
  coolColor?: string
}

/** How long after the last press the command goes out, so a run of taps costs one command. */
export const SEND_DELAY_MS = 350

/** The two colours the face is drawn in, unless the widget's settings say otherwise. */
export const DEFAULT_HEAT_COLOR = '#f26a1b'
export const DEFAULT_COOL_COLOR = '#1f8cee'

/* Every default in one place, read by the widget, the detail sheet's control and the checks. */
export const DEFAULT_COMMANDS = {
  heat: 'HEAT',
  cool: 'COOL',
  fanAuto: 'AUTO',
  fanOn: 'ON',
  auxOn: 'ON',
  auxOff: 'OFF',
} as const
export const DEFAULT_HEATING_STATES = 'heating, HEATING, 1'
export const DEFAULT_COOLING_STATES = 'cooling, COOLING, 2'

/* Tables keyed by strings out of stored configuration are read through `lookup`: a look spelled
   `constructor` would otherwise find a function on Object.prototype and travel on as if real. */
const THERMO_LOOKS: Record<string, ThermostatLook> = { arc: 'arc', dial: 'dial', disc: 'disc', ring: 'ring' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** The look a new widget starts as, and the one a stored value nobody can read lands on. */
export const DEFAULT_LOOK: ThermostatLook = 'arc'

/* One answer for both: `defaultConfig` in index.tsx reads DEFAULT_LOOK as well, so a stored
   value nobody can read draws the same widget a new one does. */
export function lookOf(v: unknown): ThermostatLook {
  return lookup(THERMO_LOOKS, str(v)) ?? DEFAULT_LOOK
}

/**
 * The floor each look needs in the phone stack, where nothing else decides a row's height, plus
 * what the row of mode, fan and aux buttons under the face adds when any of them is bound.
 */
export const LOOK_FLOOR: Record<ThermostatLook, number> = { arc: 220, dial: 200, disc: 200, ring: 200 }
export const BAR_FLOOR = 44

/** The stacked-row floor this instance asks for: its look's, plus the button row where drawn. */
export function floorOf(c: Partial<ThermostatConfig>): number {
  return LOOK_FLOOR[lookOf(c.look)] + (barOf(c).any ? BAR_FLOOR : 0)
}

/**
 * The arc a look draws its scale on: where it starts (degrees, 0 = east, clockwise) and how far
 * it sweeps.
 *
 * Every look leaves the same 90-degree gap at the bottom, because that is where its two buttons
 * go and the gap has to hold them AND clear what the scale puts at its own ends: a setpoint at
 * the bottom of the range draws its FIGURE beside the ring's first tick, and at the dials' first
 * 60 degrees that figure was underneath the minus button (reported 2026-09-03). Worked out rather
 * than guessed - a figure at the end of a 270-degree arc reaches x=68 of the 100-unit face, and a
 * button of 12 units at 59 reaches 65 - and then measured by the suite on a tile whose setpoint
 * really is at the end. The ring look has no scale at all and is listed so every look answers.
 */
export const LOOK_ARC: Record<ThermostatLook, { start: number; sweep: number }> = {
  arc: { start: 135, sweep: 270 },
  dial: { start: 135, sweep: 270 },
  disc: { start: 135, sweep: 270 },
  ring: { start: 135, sweep: 270 },
}

/**
 * The colour of a temperature: where it sits in the scale, from the cooling colour at the bottom
 * to the heating colour at the top. A tick ring drawn this way says how warm a setting is before
 * anyone reads the number, which is what a thermostat's ring is for.
 *
 * Returned as a `color-mix` of the two CSS variables rather than a computed hex, so the widget's
 * own colour settings AND a theme's overrides of them both flow through - and so the caller can
 * apply it as an inline style, which beats a stylesheet's `stroke` (a colour set as an SVG
 * attribute would not).
 */
export function rampColor(fraction: number): string {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0
  // Through a warm midpoint rather than straight from one end to the other: mixing a blue and an
  // orange in equal parts gives a muddy mauve, and a whole face drawn in it (a setpoint in the
  // middle of its range) looked dead. Cool, then a warm pale, then hot.
  return f <= 0.5
    ? `color-mix(in srgb, var(--th-mid) ${Math.round(f * 200)}%, var(--th-cool))`
    : `color-mix(in srgb, var(--th-heat) ${Math.round((f - 0.5) * 200)}%, var(--th-mid))`
}

/** Which looks let the setpoint be dragged round the ring; the ring look has nothing to drag on. */
export function draggable(look: ThermostatLook): boolean {
  return look !== 'ring'
}

/* ------------------------------------------------------------------ *
 * Temperatures
 * ------------------------------------------------------------------ */

export interface Reading {
  value?: number
  /** The unit the item reports, from the live state or its formatted display. */
  unit?: string
  /** The number as the server formatted it (the item's own pattern), when it did. */
  text?: string
}

/** A temperature off an item state: the number, the unit it came with, and the server's text. */
export function readTemp(state: ItemState | undefined): Reading {
  const value = numericValue(state)
  const split = splitValueUnit(displayValue(state, ''))
  const unit = typeof state?.unit === 'string' && state.unit !== '' ? state.unit : split.unit
  const text = value !== undefined && /^-?\d/.test(split.num) ? split.num : undefined
  return { value, unit, text }
}

/** True for a Fahrenheit unit, which decides the default range and step. */
export function isFahrenheit(unit: string | undefined): boolean {
  return typeof unit === 'string' && /f/i.test(unit)
}

/** The unit in effect: the widget's own, else the first the items report. */
export function unitOf(configured: unknown, ...reported: (string | undefined)[]): string | undefined {
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  return reported.find((u) => typeof u === 'string' && u !== '')
}

/**
 * The setpoint's scale: the widget's own numbers where they are set, else what the item declares
 * about itself, else a sensible range for the unit in effect (10-30 by 0.5 for Celsius, 50-90 by
 * 1 for Fahrenheit). Guarded like every scale: a step of zero or a maximum under the minimum
 * lands on the defaults rather than on a control that cannot move.
 */
/** The three range fields as they may arrive out of storage: anything at all. */
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

/** True when the widget's own settings decide the range, so the item need not be asked. */
export function hasOwnRange(config: RangeInput): boolean {
  return [config.min, config.max, config.step].every((v) => Number.isFinite(finiteOr(v, NaN)))
}

/** The setpoint as it reads: the digits its step resolves, or a dash for no value at all. */
export function formatSetpoint(v: number | undefined, step: number): string {
  return v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(stepDecimals(step))
}

/**
 * The room's temperature as it reads: at the setpoint's own precision, which is the precision
 * the thermostat works in. The server's text is used where it resolves at least that much - an
 * item whose pattern says `%.2f` is the user asking for it - and overruled where it does not:
 * a plain Number item carries a default `%.0f` on both openHAB lines, so without this a room at
 * 19.5 read "20" next to a setpoint stepping by 0.5.
 */
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
  /** The digits after the separator, for a look that sets them small and raised. */
  frac?: string
}

/** "69.5" as its whole part and its fraction, so a look can typeset the tenths raised. */
export function tempParts(text: string): TempParts {
  const m = /^(-?\d+)[.,](\d+)$/.exec(text)
  return m ? { int: m[1], frac: m[2] } : { int: text }
}

/** A live value near enough to a commanded one for the display to keep showing the command. */
export function closeSetpoint(live: number | undefined, sent: number | undefined, step: number): boolean {
  if (live === undefined || sent === undefined) return live === sent
  return Math.abs(live - sent) <= Math.max(step, 0.5)
}

/* ------------------------------------------------------------------ *
 * The ring
 * ------------------------------------------------------------------ */

/** The angle, in degrees clockwise from east, that a 0..1 fraction sits at on an arc. */
export function angleFor(fraction: number, arc: { start: number; sweep: number }): number {
  return arc.start + Math.min(1, Math.max(0, fraction)) * arc.sweep
}

/** The angle of a point around a centre, in the same convention. */
export function angleOfPoint(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI
}

/**
 * The setpoint a press or a drag at an angle means: brought onto the arc (the gap at the bottom
 * snaps to whichever end is nearer), then onto the scale, snapped to the step's own digits.
 */
export function valueAtAngle(angleDeg: number, arc: { start: number; sweep: number }, scale: NumericScale): number {
  let a = angleDeg
  while (a < arc.start) a += 360
  while (a >= arc.start + 360) a -= 360
  // Inside the gap: the nearer end wins.
  if (a > arc.start + arc.sweep) a = a - (arc.start + arc.sweep) < (360 - arc.sweep) / 2 ? arc.start + arc.sweep : arc.start
  const raw = scale.min + ((a - arc.start) / arc.sweep) * (scale.max - scale.min)
  const snapped = snapToStep(Math.round(raw / scale.step) * scale.step, scale.step)
  return Math.min(scale.max, Math.max(scale.min, snapped))
}

/**
 * Whether a press lands on the ring rather than the face inside it or the gap the ring leaves:
 * the distance from the centre as a fraction of the radius, and the angle. A tap in the middle
 * of the dial must neither move the setpoint nor stop a hold from opening the sheet; and the gap
 * at the bottom holds the two buttons, so a press there - which reaches the ring whenever a
 * button is dimmed, since a dimmed button lets the pointer through - must not send the setpoint
 * to whichever end of the scale is nearer.
 */
export function onRing(distanceFraction: number, angleDeg: number, look: ThermostatLook): boolean {
  if (!draggable(look)) return false
  if (distanceFraction < (look === 'arc' ? 0.62 : 0.68) || distanceFraction > 1.15) return false
  const arc = LOOK_ARC[look]
  // The handle at either end of the scale sits ON the end angle and is about six degrees wide,
  // so a press on it may land a little into the gap and still means the handle.
  const slack = 6
  let a = angleDeg
  while (a < arc.start - slack) a += 360
  while (a >= arc.start - slack + 360) a -= 360
  return a <= arc.start + arc.sweep + slack
}

/** The angles of `n` ticks spread along an arc, first and last on its ends. */
export function ticksOf(n: number, arc: { start: number; sweep: number }): number[] {
  if (n <= 1) return [arc.start]
  return Array.from({ length: n }, (_, i) => arc.start + (i / (n - 1)) * arc.sweep)
}

/* ------------------------------------------------------------------ *
 * Mode, fan, aux and status
 * ------------------------------------------------------------------ */

/** The item's state as a string, or undefined for NULL/UNDEF and for an item not yet heard from. */
export function knownState(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw !== 'NULL' && raw !== 'UNDEF' && raw !== '' ? raw : undefined
}

/** Two states that mean the same thing: a numeric echo, or the same word in either case. */
export function sameState(a: string, b: string): boolean {
  return sameCommand(a, b) || a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** A comma-separated setting as its entries, trimmed, empties dropped; anything else is nothing. */
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
    auxOff: commandOr(c.auxOffCommand, DEFAULT_COMMANDS.auxOff),
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

/** True, false, or undefined for an item not heard from (or in neither state). */
export function auxFrom(state: string | undefined, c: Partial<ThermostatConfig>): boolean | undefined {
  const s = knownState(state)
  if (s === undefined) return undefined
  const cmd = commands(c)
  if (sameState(s, cmd.auxOn)) return true
  if (sameState(s, cmd.auxOff)) return false
  return undefined
}

/** What the status item says the system is doing: a listed heating or cooling state, else idle. */
export function activityFrom(state: string | undefined, c: Partial<ThermostatConfig>): Activity {
  const s = knownState(state)
  if (s === undefined) return 'unknown'
  const heating = parseStates(c.heatingStates ?? DEFAULT_HEATING_STATES)
  const cooling = parseStates(c.coolingStates ?? DEFAULT_COOLING_STATES)
  if (heating.some((h) => sameState(h, s))) return 'heating'
  if (cooling.some((k) => sameState(k, s))) return 'cooling'
  return 'idle'
}

/**
 * The colour the face is drawn in. The mode decides where there is one (a thermostat set to heat
 * is orange whether or not it is heating this minute, the way the reference cards draw it);
 * where the mode is off, automatic or unknown, what the system is doing decides; otherwise the
 * face is neutral.
 */
export function toneOf(mode: HvacMode, activity: Activity): Tone {
  if (mode === 'heat') return 'heat'
  if (mode === 'cool') return 'cool'
  if (activity === 'heating') return 'heat'
  if (activity === 'cooling') return 'cool'
  return 'neutral'
}

/**
 * What the status line says. The status item, where there is one, is the most exact answer
 * (Heating, Cooling, Idle); without it the mode is named; a mode that is neither heat nor cool
 * is shown as the item's own word, since it is whatever the binding calls it.
 */
export type StatusText = { kind: 'heating' | 'cooling' | 'idle' | 'heat' | 'cool' } | { kind: 'raw'; text: string } | { kind: 'none' }

export function statusOf(mode: HvacMode, activity: Activity, modeState: string | undefined): StatusText {
  if (activity === 'heating' || activity === 'cooling' || activity === 'idle') return { kind: activity }
  if (mode === 'heat' || mode === 'cool') return { kind: mode }
  const raw = knownState(modeState)
  if (mode === 'other' && raw !== undefined) return { kind: 'raw', text: raw }
  return { kind: 'none' }
}

/** A colour setting, or undefined for anything that is not a non-empty string. */
export function colorOf(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** Which of the three button groups the row under the face draws: the ones with an item. */
export function barOf(c: Partial<ThermostatConfig>): { mode: boolean; fan: boolean; aux: boolean; any: boolean } {
  const bound = (v: unknown) => typeof v === 'string' && v.trim() !== ''
  const mode = bound(c.modeItem)
  const fan = bound(c.fanItem)
  const aux = bound(c.auxItem)
  return { mode, fan, aux, any: mode || fan || aux }
}
