/**
 * The stepper's pure half: how a stored configuration is read, and what one press does to a
 * value. Nothing here touches React or the DOM, so every rule is unit-checked in isolation.
 *
 * Two kinds of value step. A NUMBER moves by its step size inside a range, snapped to the digits
 * the step resolves (0.1 + 0.2 must not read 0.30000000000000004 on a thermostat). A LIST moves
 * through its choices one entry at a time, stopping at the ends or wrapping around, as the widget
 * was told. Everything read out of the configuration is guarded: a look nobody spelled right, a
 * step of zero, a choices field that is not a string - all land on a usable default rather than
 * on NaN or a thrown render.
 */
import type { Item } from '../../api/types'
import { lookup } from '../../model/lookup'
import type { Choice } from '../common/choices'
import { stepDecimals } from '../common/itemControl'
import type { NumericScale } from '../common/itemControl'

export type StepperLook = 'stack' | 'pair' | 'spinner' | 'split' | 'carousel' | 'range'
export type StepperArrows = 'auto' | 'chevron' | 'triangle' | 'plusminus' | 'arrow'
export type StepperFinish = 'plain' | 'glass' | 'glow' | 'solid' | 'sheen'
export type StepperMode = 'number' | 'list'

export interface StepperConfig {
  item: string
  label?: string
  /** What the value is: a number inside a range, or one of a list of choices. */
  mode?: StepperMode
  /** The layout: where the reading sits and where the two controls go. */
  look?: StepperLook
  /** What the buttons and the reading are made of. */
  finish?: StepperFinish
  /** The glyph on the buttons; `auto` picks plus/minus for a number and chevrons for a list. */
  arrows?: StepperArrows
  min?: number
  max?: number
  step?: number
  unit?: string
  /** Manual choices, one per line: `COMMAND=Label` or just `COMMAND`. Empty = the item's own. */
  choices?: string
  /** A list goes round again past its last entry. */
  wrap?: boolean
}

/** How long after the last press the command goes out, so a run of taps costs one command. */
export const SEND_DELAY_MS = 350

/** A position indicator is a row of dots only while the row stays readable. */
export const MAX_DOTS = 12

/* Tables keyed by strings out of stored configuration are read through `lookup`: a look spelled
   `constructor` would otherwise find a function on Object.prototype and travel on as if real. */
const LOOKS: Record<string, StepperLook> = {
  stack: 'stack',
  pair: 'pair',
  spinner: 'spinner',
  split: 'split',
  carousel: 'carousel',
  range: 'range',
}
/* Not `ARROWS`: the stat widget has a table of that name with a pinned key, and the source scan
   for bare-index reads is cross-file by identifier, so sharing the name would flag its read. */
const ARROW_STYLES: Record<string, StepperArrows> = {
  auto: 'auto',
  chevron: 'chevron',
  triangle: 'triangle',
  plusminus: 'plusminus',
  arrow: 'arrow',
}
const FINISHES: Record<string, StepperFinish> = { plain: 'plain', glass: 'glass', glow: 'glow', solid: 'solid', sheen: 'sheen' }
const MODES: Record<string, StepperMode> = { number: 'number', list: 'list' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/* The fallbacks are the widget's defaults (a spinner in the glow finish), which `defaultConfig`
   in index.tsx carries as well, so a stored value nobody can read draws the same widget a new
   one does. */
export function lookOf(v: unknown): StepperLook {
  return lookup(LOOKS, str(v)) ?? 'spinner'
}
export function arrowsOf(v: unknown): StepperArrows {
  return lookup(ARROW_STYLES, str(v)) ?? 'auto'
}
export function finishOf(v: unknown): StepperFinish {
  return lookup(FINISHES, str(v)) ?? 'glow'
}
export function modeOf(v: unknown): StepperMode {
  return lookup(MODES, str(v)) ?? 'number'
}
/** Only `true` wraps, which is what the checkbox stores; anything else out of a file does not. */
export function wrapOf(v: unknown): boolean {
  return v === true
}

/**
 * Which way a look lays its two controls out, which decides whether a chevron points up or
 * right. The split tile answers `vertical` here and draws the horizontal glyph as well, because
 * it turns sideways in a wide cell and only the stylesheet knows the cell's shape.
 */
export const LOOK_AXIS: Record<StepperLook, 'vertical' | 'horizontal'> = {
  stack: 'vertical',
  spinner: 'vertical',
  split: 'vertical',
  pair: 'horizontal',
  carousel: 'horizontal',
  range: 'horizontal',
}

/**
 * The floor each look needs in the phone stack, where nothing else decides a row's height. The
 * stack sandwiches the reading between two finger-sized bars, so it asks for the most; the
 * rest fit a shorter row.
 */
export const LOOK_FLOOR: Record<StepperLook, number> = {
  stack: 150,
  pair: 130,
  range: 130,
  spinner: 120,
  split: 120,
  carousel: 120,
}

export type ArrowShape = 'chevron' | 'triangle' | 'arrow' | 'plusminus'
export type ArrowDir = 'up' | 'down' | 'left' | 'right' | 'plus' | 'minus'
export interface Glyph {
  shape: ArrowShape
  dir: ArrowDir
}

/**
 * The glyph on one of the two buttons. `dir` is +1 for more/next and -1 for less/previous;
 * `axis` is how the look lays the buttons out. Plus and minus are the same whichever way the
 * buttons sit; a chevron points along the axis.
 */
export function glyphFor(arrows: StepperArrows, mode: StepperMode, axis: 'vertical' | 'horizontal', dir: 1 | -1): Glyph {
  const shape: ArrowShape = arrows === 'auto' ? (mode === 'number' ? 'plusminus' : 'chevron') : arrows
  if (shape === 'plusminus') return { shape, dir: dir > 0 ? 'plus' : 'minus' }
  if (axis === 'vertical') return { shape, dir: dir > 0 ? 'up' : 'down' }
  return { shape, dir: dir > 0 ? 'right' : 'left' }
}

/** A value on the step's own digits: what `72.1 + 0.2` has to read on a thermostat. */
export function snapToStep(v: number, step: number): number {
  return Number(v.toFixed(stepDecimals(step)))
}

/**
 * The value one press moves to. Nothing known yet (a NULL item) starts at the minimum whichever
 * way it is pressed; otherwise one step along, snapped, and held inside the range.
 */
export function stepNumber(current: number | undefined, dir: 1 | -1, scale: NumericScale): number {
  if (current === undefined || !Number.isFinite(current)) return scale.min
  const next = snapToStep(current + dir * scale.step, scale.step)
  return Math.min(scale.max, Math.max(scale.min, next))
}

/** True when a press in that direction has nowhere to go. An unknown value can always start. */
export function atLimit(current: number | undefined, dir: 1 | -1, scale: NumericScale): boolean {
  if (current === undefined || !Number.isFinite(current)) return false
  return dir > 0 ? current >= scale.max : current <= scale.min
}

/** The reading a number shows: the digits its step resolves, or a dash for no value at all. */
export function formatNumber(v: number | undefined, step: number): string {
  return v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(stepDecimals(step))
}

/** Where a value sits in its range, 0..1, for the range bar. An unknown value sits at 0. */
export function fractionOf(v: number | undefined, scale: NumericScale): number {
  if (v === undefined || !Number.isFinite(v)) return 0
  const f = (v - scale.min) / (scale.max - scale.min)
  return Math.min(1, Math.max(0, Number.isFinite(f) ? f : 0))
}

/** How many steps the range holds: a fan with speeds 1..5 at step 1 holds five positions. */
export function positionsIn(scale: NumericScale): number {
  return Math.round((scale.max - scale.min) / scale.step) + 1
}

/** Which of those positions a value is at, for the carousel's dots. */
export function positionOf(v: number | undefined, scale: NumericScale): number {
  if (v === undefined || !Number.isFinite(v)) return -1
  return Math.round((v - scale.min) / scale.step)
}

/**
 * Two commands that mean the same state. Numerically tolerant because openHAB echoes `64` as
 * `64.0` and a Gson round trip writes `1` as `1.0`; the empty string is guarded first because
 * `Number('')` is 0 and would make "" the same as "0".
 */
export function sameCommand(a: string, b: string): boolean {
  if (a === b) return true
  if (a.trim() === '' || b.trim() === '') return false
  const x = Number(a)
  const y = Number(b)
  return Number.isFinite(x) && Number.isFinite(y) && x === y
}

/** Index of the choice a state is at, or -1 when the state is not one of them (or unknown). */
export function choiceIndex(state: string | undefined | null, choices: Choice[]): number {
  if (typeof state !== 'string') return -1
  return choices.findIndex((c) => sameCommand(c.command, state))
}

/**
 * The index one press moves to. An unknown position starts at the first entry either way; the
 * ends stop or wrap as configured. An empty list has nowhere to go and answers -1.
 */
export function stepIndex(i: number, dir: 1 | -1, n: number, wrap: boolean): number {
  if (n <= 0) return -1
  if (i < 0) return 0
  const j = i + dir
  if (j < 0) return wrap ? n - 1 : 0
  if (j >= n) return wrap ? 0 : n - 1
  return j
}

/**
 * A list out of the item itself, for a widget given no choices of its own: the commands its
 * channel declares, else the states its description names. Both come off the server as data
 * nobody here chose, so every field is checked before it is used.
 */
export function itemChoices(item: Item | undefined): Choice[] {
  const commands = item?.commandDescription?.commandOptions
  if (Array.isArray(commands) && commands.length > 0) {
    return commands
      .filter((o) => o && typeof o.command === 'string')
      .map((o) => ({ command: o.command, label: typeof o.label === 'string' && o.label !== '' ? o.label : o.command }))
  }
  const states = item?.stateDescription?.options
  if (Array.isArray(states) && states.length > 0) {
    return states
      .filter((o) => o && typeof o.value === 'string')
      .map((o) => ({ command: o.value, label: typeof o.label === 'string' && o.label !== '' ? o.label : o.value }))
  }
  return []
}

/**
 * Is a live value close enough to a commanded one for the optimistic display to keep showing
 * what was sent? A device echoes what it can hold - a dimmer quantises, a thermostat rounds - so
 * a number within a step is the same value; a list entry has to be the same command.
 */
export function closeEnough(live: string | null, sent: string | null, mode: StepperMode, step: number): boolean {
  if (live === null || sent === null) return live === sent
  if (mode === 'list') return sameCommand(live, sent)
  const a = Number(live)
  const b = Number(sent)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return live === sent
  return Math.abs(a - b) <= Math.max(step, 0.5)
}
