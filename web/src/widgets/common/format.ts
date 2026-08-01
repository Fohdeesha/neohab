import type { ItemState } from '../../api/types'

/** Best display string for an item state: server displayState if present, else raw state. */
export function displayValue(state: ItemState | undefined, fallback = '—'): string {
  if (!state) return fallback
  return state.displayState ?? state.state ?? fallback
}

/**
 * Split a formatted state like "11.5 °F" into the number and a short unit suffix, so the two
 * can be typeset differently (big value, small raised unit — the stat-tile look). Only a
 * leading number followed by a short digit-free tail splits; anything else ("ON",
 * "Partly cloudy", timestamps, HSB triples) stays whole.
 */
export function splitValueUnit(text: string): { num: string; unit?: string } {
  const m = /^(-?\d[\d.,]*)\s*(\D{1,8})?$/.exec(text.trim())
  if (!m || !/\d$/.test(m[1])) return { num: text }
  const unit = m[2]?.trim()
  return unit ? { num: m[1], unit } : { num: m[1] }
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
