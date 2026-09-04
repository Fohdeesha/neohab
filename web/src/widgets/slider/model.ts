/**
 * The slider's pure half: how a stored configuration is read, and what each style needs from the
 * tile it is drawn in. Nothing here touches React or the DOM, so every rule is unit-checked in
 * isolation.
 *
 * Five styles draw the same value: the plain one is the theme's own range control (what this
 * widget has always been), and four are built from their own parts - a track, a fill and a thumb
 * this stylesheet owns - so a fill can be a gradient, a wedge or a sunken rail. Each runs either
 * way round; the orientation is its own setting, so any style can be a fader.
 *
 * Everything read out of the configuration is guarded: a style nobody spelled right, an
 * orientation out of an imported file, a step of zero - all land on a usable default rather than
 * on NaN or a blank select.
 */
import { lookup } from '../../model/lookup'
import { stepDecimals } from '../common/itemControl'
import type { NumericScale } from '../common/itemControl'

export type SliderStyle = 'plain' | 'gradient' | 'bubble' | 'inset' | 'taper'
export type SliderOrient = 'horizontal' | 'vertical'

export interface SliderConfig {
  item: string
  label?: string
  /** Which of the five looks draws the track. */
  style?: SliderStyle
  /** Which way the track runs. Independent of the style: any of them can be a fader. */
  orient?: SliderOrient
  min?: number
  max?: number
  step?: number
  unit?: string
  /**
   * The universal Accent color setting, which the grid puts on the cell as `--nh-cellaccent`.
   * Read here only to answer one question - has the tile been given a colour of its own? - so a
   * style can tint its reference colours toward it instead of ignoring it or flattening to it.
   */
  accentColor?: string
}

/* Tables keyed by strings out of stored configuration go through `lookup`: a style spelled
   `constructor` would otherwise find a function on Object.prototype and travel on as if real. */
const STYLES: Record<string, SliderStyle> = {
  plain: 'plain',
  gradient: 'gradient',
  bubble: 'bubble',
  inset: 'inset',
  taper: 'taper',
}
const ORIENTS: Record<string, SliderOrient> = { horizontal: 'horizontal', vertical: 'vertical' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/* The fallbacks are the widget's defaults, which `defaultConfig` in index.tsx carries as well, so
   a stored value nobody can read draws the same widget a new one does. A slider that predates the
   styles has no `style` key at all and lands here, which is why the default is the gradient one
   rather than the plain one. */
export function styleOf(v: unknown): SliderStyle {
  return lookup(STYLES, str(v)) ?? 'gradient'
}
export function orientOf(v: unknown): SliderOrient {
  return lookup(ORIENTS, str(v)) ?? 'horizontal'
}

/**
 * Has the tile been given an accent colour of its own? The same rule `widgetAccentColor` applies
 * before writing `--nh-cellaccent` onto the cell, so the class this answers and the variable that
 * class reads can never disagree.
 */
export function tintedOf(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '' && v.length <= 40
}

/**
 * The floor a style needs in the phone stack, where nothing else decides a row's height.
 *
 * A horizontal track needs room for the reading above it and a finger-sized band around it; the
 * bubble asks for more because its badge rides above the thumb, and the inset rail sits in a plate
 * with padding of its own. A vertical one is a fader: below about this it is a control with no
 * travel, which is worse than a short horizontal one.
 */
export const STYLE_FLOOR: Record<SliderStyle, number> = {
  plain: 90,
  gradient: 96,
  taper: 96,
  inset: 104,
  bubble: 120,
}
export const VERTICAL_FLOOR = 200

export function sliderFloor(style: SliderStyle, orient: SliderOrient): number {
  return orient === 'vertical' ? VERTICAL_FLOOR : STYLE_FLOOR[style]
}

/** The reading: the digits the step resolves, plus the unit suffix when one was stored. */
export function readingOf(value: number, step: number, unit?: string): string {
  const n = Number.isFinite(value) ? value : 0
  return n.toFixed(stepDecimals(step)) + (typeof unit === 'string' ? unit : '')
}

/**
 * The two end labels the inset rail prints, as its reference does. No unit on them: they are the
 * ends of the scale rather than readings, and "0 %" beside "100 %" is noise in a control whose
 * own reading already carries the unit.
 */
export function boundsOf(scale: NumericScale): [string, string] {
  const d = stepDecimals(scale.step)
  return [scale.min.toFixed(d), scale.max.toFixed(d)]
}
