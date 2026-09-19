import type { Item } from '../../api/types'
import { lookup } from '../../model/lookup'
import type { Choice } from '../common/choices'
import { stepDecimals } from '../common/itemControl'
import type { NumericScale } from '../common/itemControl'
import { sameCommand } from '../common/stepping'

export { atLimit, fractionOf, sameCommand, snapToStep, stepNumber } from '../common/stepping'

export type StepperLook = 'stack' | 'pair' | 'spinner' | 'split' | 'carousel' | 'range'
export type StepperArrows = 'auto' | 'chevron' | 'triangle' | 'plusminus' | 'arrow'
export type StepperFinish = 'plain' | 'glass' | 'glow' | 'solid' | 'sheen'
export type StepperMode = 'number' | 'list'

export interface StepperConfig {
  item: string
  label?: string
  mode?: StepperMode
  look?: StepperLook
  finish?: StepperFinish
  arrows?: StepperArrows
  min?: number
  max?: number
  step?: number
  unit?: string
  choices?: string
  wrap?: boolean
}

export const SEND_DELAY_MS = 350

export const MAX_DOTS = 12

const LOOKS: Record<string, StepperLook> = {
  stack: 'stack',
  pair: 'pair',
  spinner: 'spinner',
  split: 'split',
  carousel: 'carousel',
  range: 'range'
}
const ARROW_STYLES: Record<string, StepperArrows> = {
  auto: 'auto',
  chevron: 'chevron',
  triangle: 'triangle',
  plusminus: 'plusminus',
  arrow: 'arrow'
}
const FINISHES: Record<string, StepperFinish> = { plain: 'plain', glass: 'glass', glow: 'glow', solid: 'solid', sheen: 'sheen' }
const MODES: Record<string, StepperMode> = { number: 'number', list: 'list' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

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
export function wrapOf(v: unknown): boolean {
  return v === true
}

export const LOOK_AXIS: Record<StepperLook, 'vertical' | 'horizontal'> = {
  stack: 'vertical',
  spinner: 'vertical',
  split: 'vertical',
  pair: 'horizontal',
  carousel: 'horizontal',
  range: 'horizontal'
}

export const LOOK_FLOOR: Record<StepperLook, number> = {
  stack: 150,
  pair: 130,
  range: 130,
  spinner: 120,
  split: 120,
  carousel: 120
}

export type ArrowShape = 'chevron' | 'triangle' | 'arrow' | 'plusminus'
export type ArrowDir = 'up' | 'down' | 'left' | 'right' | 'plus' | 'minus'
export interface Glyph {
  shape: ArrowShape
  dir: ArrowDir
}

export function glyphFor(arrows: StepperArrows, mode: StepperMode, axis: 'vertical' | 'horizontal', dir: 1 | -1): Glyph {
  const shape: ArrowShape = arrows === 'auto' ? (mode === 'number' ? 'plusminus' : 'chevron') : arrows
  if (shape === 'plusminus') return { shape, dir: dir > 0 ? 'plus' : 'minus' }
  if (axis === 'vertical') return { shape, dir: dir > 0 ? 'up' : 'down' }
  return { shape, dir: dir > 0 ? 'right' : 'left' }
}

// The step says how precise a press is, not how precise the item is: a Number reporting 3.6 under a
// step of 1 is still 3.6, and a readout of "4" is a value the item does not hold. Rounded to three
// places first, or float noise (0.1 + 0.2) would claim seventeen decimals.
export function valueDecimals(v: number): number {
  const s = String(Math.round(v * 1000) / 1000)
  const at = s.indexOf('.')
  return at < 0 ? 0 : s.length - at - 1
}

export function formatNumber(v: number | undefined, step: number): string {
  if (v === undefined || !Number.isFinite(v)) return '-'
  return v.toFixed(Math.max(stepDecimals(step), valueDecimals(v)))
}

export function positionsIn(scale: NumericScale): number {
  return Math.round((scale.max - scale.min) / scale.step) + 1
}

export function positionOf(v: number | undefined, scale: NumericScale): number {
  if (v === undefined || !Number.isFinite(v)) return -1
  return Math.round((v - scale.min) / scale.step)
}

export function choiceIndex(state: string | undefined | null, choices: Choice[]): number {
  if (typeof state !== 'string') return -1
  return choices.findIndex((c) => sameCommand(c.command, state))
}

export function stepIndex(i: number, dir: 1 | -1, n: number, wrap: boolean): number {
  if (n <= 0) return -1
  if (i < 0) return 0
  const j = i + dir
  if (j < 0) return wrap ? n - 1 : 0
  if (j >= n) return wrap ? 0 : n - 1
  return j
}

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

export function closeEnough(live: string | null, sent: string | null, mode: StepperMode, step: number): boolean {
  if (live === null || sent === null) return live === sent
  if (mode === 'list') return sameCommand(live, sent)
  const a = Number(live)
  const b = Number(sent)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return live === sent
  return Math.abs(a - b) <= Math.max(step, 0.5)
}
