import type { ItemState } from '../../api/types'
import { isOn } from '../common/format'
import { stateMatches } from '../common/stateIcon'

export type ButtonStyle = 'button' | 'switch'

export interface ButtonState {
  item?: string
  command?: unknown
  commandAlt?: unknown
  toggle?: unknown
  nonZeroIsOn?: unknown
  style?: unknown
}

// a hand-edited config can hold a command as a number, and stateMatches has always accepted one
function commandText(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v !== '') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return fallback
}

// the look, and only the look: both styles send the same commands and read state the same way
export function styleOf(v: unknown): ButtonStyle {
  return v === 'switch' ? 'switch' : 'button'
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
