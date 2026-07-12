import type { ItemState } from '../../api/types'

/** Best display string for an item state: server displayState if present, else raw state. */
export function displayValue(state: ItemState | undefined, fallback = '—'): string {
  if (!state) return fallback
  return state.displayState ?? state.state ?? fallback
}

/** Numeric value of an item state, if any. */
export function numericValue(state: ItemState | undefined): number | undefined {
  if (!state) return undefined
  if (typeof state.numericState === 'number') return state.numericState
  const n = parseFloat(state.state)
  return Number.isNaN(n) ? undefined : n
}

/** Interpret an item state as on/off (handles OnOff, brightness, HSB). */
export function isOn(state: ItemState | undefined): boolean {
  if (!state) return false
  const raw = state.state
  if (raw === 'ON') return true
  if (raw === 'OFF') return false
  // Dimmer/Color: on when brightness component > 0
  const parts = raw.split(',')
  const level = parseFloat(parts[parts.length - 1])
  return !Number.isNaN(level) && level > 0
}
