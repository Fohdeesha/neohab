/**
 * What control a popup should put in front of one item, and the numeric scale it works in.
 *
 * The detail sheet used to work this out from the item's STATE alone - a number got a 0-100 slider,
 * ON/OFF got two buttons, anything else got nothing - which throws away everything the widget's
 * author configured. A slider set to 2000-6500 K was handed a 0-100 track that would have commanded
 * 47 to a lamp; a rollershutter got a position slider where its tile offers up/stop/down, which on a
 * garage door is a real door moving; a media player got no buttons at all, because PLAY is not a
 * shape a state sniffer can recognise. So the WIDGET is asked instead - see
 * {@link WidgetDefinition.controlFor} - and this is the vocabulary it answers in.
 */

/** One command a control can send, with the text on its button. */
export interface ItemChoice {
  command: string
  /**
   * Fixed vocabulary out of a widget's own definition ('Up', 'Play'), translated at render the
   * same way the settings panel translates a schema's labels.
   */
  labelKey?: string
  /**
   * Text out of stored configuration - a user's own choice label. Rendered verbatim and NEVER
   * passed through `t()`: i18next reads a `{{...}}` inside a string as interpolation and would
   * eat it.
   */
  label?: string
}

/** A slider over a scale, with the unit suffix shown beside the value. */
export interface ItemRange extends NumericScale {
  kind: 'range'
  unit?: string
}

export type ItemControl =
  /**
   * Work it out from the item's live state, the way the floor plan's tap popup does. For the
   * surfaces that genuinely have nothing to declare: a plan's lights are whatever the house has.
   */
  | { kind: 'auto' }
  | ItemRange
  | { kind: 'onoff'; on: string; off: string }
  | { kind: 'choices'; choices: ItemChoice[] }
  /**
   * The colour picker. `power` asks for the widget's own on and off buttons on the swatch, so a
   * long press on a colour tile that has them offers the same control the tile does.
   */
  | { kind: 'color'; power?: boolean }

/**
 * A stored value as a finite number, or the fallback. Configuration that did not come from the
 * editor is untrusted input: an imported `min: "abc"` or a hand-edited `step: null` has to land on
 * something usable rather than NaN.
 */
export function finiteOr(v: unknown, fallback: number): number {
  // Before parsing, because `Number('')` is 0: a number field someone cleared would otherwise
  // read as a deliberate zero - a maximum of 0, a step of 0, a gauge with no segments.
  if (typeof v === 'string' && v.trim() === '') return fallback
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

export interface NumericScale {
  min: number
  max: number
  step: number
}

/**
 * The scale a numeric control works in, guarded at the read.
 *
 * A step of zero or less makes a range input inert and divides by zero in the dial's pointer snap;
 * a maximum at or below the minimum leaves no range to map a value onto. Both are given the
 * defaults instead of being passed on.
 */
export function numericScale(min: unknown, max: unknown, step: unknown): NumericScale {
  const lo = finiteOr(min, 0)
  const hi = finiteOr(max, 100)
  const rawStep = finiteOr(step, 1)
  return { min: lo, max: hi > lo ? hi : lo + 100, step: rawStep > 0 ? rawStep : 1 }
}

/** A range control over that scale, with a unit suffix only when one was actually stored. */
export function rangeControl(scale: NumericScale, unit: unknown): ItemRange {
  return { ...scale, kind: 'range', unit: typeof unit === 'string' && unit !== '' ? unit : undefined }
}

/** A stored command string, or the fallback when the key is absent or empty. */
export function commandOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v !== '' ? v : fallback
}

/**
 * Decimal places implied by the step: 0.1 -> 1, 5 -> 0. Step is the precision a control works in,
 * so it decides how many decimals the reading shows - a 0.1-step temperature control that rounded
 * to whole degrees would be throwing away the digit it was configured to resolve. Display is never
 * snapped to the step itself: a 5W-step power gauge still reads 1234, not 1235.
 */
export function stepDecimals(step: number): number {
  const dot = String(step).indexOf('.')
  return dot < 0 ? 0 : Math.min(6, String(step).length - dot - 1)
}
