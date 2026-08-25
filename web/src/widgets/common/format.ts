import type { ItemState } from '../../api/types'

/** Best display string for an item state: server displayState if present, else raw state. */
export function displayValue(state: ItemState | undefined, fallback = '-'): string {
  if (!state) return fallback
  return state.displayState ?? state.state ?? fallback
}

/**
 * Split a formatted state like "11.5 °F" into the number and a short unit suffix, so the two
 * can be typeset differently (big value, small raised unit - the stat-tile look). Only a
 * leading number followed by a short digit-free tail splits; anything else ("ON",
 * "Partly cloudy", timestamps, HSB triples) stays whole.
 */
export function splitValueUnit(text: string): { num: string; unit?: string } {
  const m = /^(-?\d[\d.,]*)\s*(\D{1,8})?$/.exec(text.trim())
  if (!m || !/\d$/.test(m[1])) return { num: text }
  const unit = m[2]?.trim()
  return unit ? { num: m[1], unit } : { num: m[1] }
}

/**
 * Split a numeric display string for segment-display typesetting: when exactly one digit
 * follows the decimal separator ("71.8"), the separator stays with the integer part and the
 * lone tenths digit splits off so a theme can raise and shrink it (the weather-station look,
 * "29.68" and every other shape stay whole). Inert everywhere else: the two parts always
 * concatenate back to the input.
 */
export function segParts(num: string): { int: string; frac?: string } {
  const m = /^(-?\d+[.,])(\d)$/.exec(num)
  return m ? { int: m[1], frac: m[2] } : { int: num }
}

/**
 * Ghost-segment underlay text for a display string: every digit becomes '8' (all seven
 * segments lit), everything else is kept so the ghost overlays the real text glyph-for-glyph.
 * Returns undefined for text with no digits - there is nothing to ghost.
 */
export function ghostFor(text: string): string | undefined {
  return /\d/.test(text) ? text.replace(/\d/g, '8') : undefined
}

/** True when a display string is plain digits/separators - safe for a 7-segment face. */
export function isSegmentable(text: string): boolean {
  return /^-?[\d.,: ]+$/.test(text) && /\d/.test(text)
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
  // The other readers here degrade to a fallback when `state` is missing; this one used to throw
  // on `raw.split`, which turned a Switch tile into the widget-boundary error tile. "Not a string"
  // is not "on".
  if (typeof raw !== 'string') return false
  // Dimmer/Color: on when brightness component > 0
  const parts = raw.split(',')
  const level = parseFloat(parts[parts.length - 1])
  return !Number.isNaN(level) && level > 0
}
