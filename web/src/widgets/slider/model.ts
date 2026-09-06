import { lookup } from '../../model/lookup'
import { stepDecimals } from '../common/itemControl'
import type { NumericScale } from '../common/itemControl'

export type SliderStyle = 'plain' | 'gradient' | 'bubble' | 'inset' | 'taper'
export type SliderOrient = 'horizontal' | 'vertical'

export interface SliderConfig {
  item: string
  label?: string
  style?: SliderStyle
  orient?: SliderOrient
  min?: number
  max?: number
  step?: number
  unit?: string
  accentColor?: string
}

const STYLES: Record<string, SliderStyle> = {
  plain: 'plain',
  gradient: 'gradient',
  bubble: 'bubble',
  inset: 'inset',
  taper: 'taper'
}
const ORIENTS: Record<string, SliderOrient> = { horizontal: 'horizontal', vertical: 'vertical' }

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function styleOf(v: unknown): SliderStyle {
  return lookup(STYLES, str(v)) ?? 'gradient'
}
export function orientOf(v: unknown): SliderOrient {
  return lookup(ORIENTS, str(v)) ?? 'horizontal'
}

export function tintedOf(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '' && v.length <= 40
}

export const STYLE_FLOOR: Record<SliderStyle, number> = {
  plain: 90,
  gradient: 96,
  taper: 96,
  inset: 104,
  bubble: 120
}
export const VERTICAL_FLOOR = 200

export function sliderFloor(style: SliderStyle, orient: SliderOrient): number {
  return orient === 'vertical' ? VERTICAL_FLOOR : STYLE_FLOOR[style]
}

export function readingOf(value: number, step: number, unit?: string): string {
  const n = Number.isFinite(value) ? value : 0
  return n.toFixed(stepDecimals(step)) + (typeof unit === 'string' ? unit : '')
}

export function boundsOf(scale: NumericScale): [string, string] {
  const d = stepDecimals(scale.step)
  return [scale.min.toFixed(d), scale.max.toFixed(d)]
}
