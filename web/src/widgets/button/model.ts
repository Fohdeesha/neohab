import type { ItemState } from '../../api/types'
import { lookup } from '../../model/lookup'
import { isOn } from '../common/format'
import { stateMatches } from '../common/stateIcon'

export type ButtonStyle = 'button' | 'card' | 'switch'
export type ButtonFinish = 'plain' | 'solid' | 'glass' | 'glow' | 'edge' | 'outline' | 'sheen' | 'bare'

export interface ButtonState {
  item?: string
  command?: unknown
  commandAlt?: unknown
  toggle?: unknown
  nonZeroIsOn?: unknown
  style?: unknown
  finish?: unknown
}

const STYLES: Record<string, ButtonStyle> = { button: 'button', card: 'card', switch: 'switch' }
const FINISHES: Record<string, ButtonFinish> = {
  plain: 'plain',
  solid: 'solid',
  glass: 'glass',
  glow: 'glow',
  edge: 'edge',
  outline: 'outline',
  sheen: 'sheen',
  bare: 'bare'
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

// a hand-edited config can hold a command as a number, and stateMatches has always accepted one
function commandText(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v !== '') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return fallback
}

// where the parts sit, and only that: every style sends the same commands and reads state the same way
export function styleOf(v: unknown): ButtonStyle {
  return lookup(STYLES, str(v)) ?? 'button'
}

// what the face is made of. Plain is the theme's own control, which is why the theme stylesheets restyle
// .nh-button--plain alone; the rest keep their look in every theme, in the tile's accent color.
export function finishOf(v: unknown): ButtonFinish {
  return lookup(FINISHES, str(v)) ?? 'plain'
}

export function drawsFace(v: unknown): boolean {
  return styleOf(v) !== 'switch'
}

// plain draws the box inside the tile it always did; anything the user picked fills the tile instead
export function fillsTile(config: ButtonState): boolean {
  return drawsFace(config.style) && finishOf(config.finish) !== 'plain'
}

// a card stacks a chip, a name and a caption, so it needs more room than a face that centres one icon
export const CARD_FLOOR = 116

export function buttonFloor(config: ButtonState): number {
  return styleOf(config.style) === 'card' ? CARD_FLOOR : 0
}

export function toggleCommands(config: ButtonState): { on: string; off?: string } {
  const alt = commandText(config.commandAlt, '')
  return { on: commandText(config.command, ''), off: config.toggle === true && alt !== '' ? alt : undefined }
}

// "above 0 counts as on" is the dimmer and color rule: isOn reads the last part of the state, so 50 and
// 120,50,40 are both on. The exact match stays on top of it, which is the only thing that works for a
// String item, where isOn always says off.
export function isActive(config: ButtonState, state: ItemState | undefined): boolean {
  if (config.toggle !== true) return false
  const exact = stateMatches(commandText(config.command, ''), state?.state)
  return config.nonZeroIsOn === true ? isOn(state) || exact : exact
}

export function commandFor(config: ButtonState, active: boolean): string {
  const { on, off } = toggleCommands(config)
  return active && off ? off : on
}
