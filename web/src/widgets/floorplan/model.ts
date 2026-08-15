/**
 * Floor plan model: light positions on an uploaded plan image, the object-fit math that maps
 * them to pixels, and the glow each light casts from its live state. Pure - the component and
 * the editor sheet both build on this, and the unit tests hold it to its clamps.
 *
 * Positions are percentages of the plan image (not the widget box), so a light stays on its
 * lamp when the widget is resized, the breakpoint changes, or the image is re-uploaded at a
 * different resolution with the same aspect.
 */
import { parseHsb, hsbToRgb } from '../../model/color'

export interface FloorplanLight {
  /** Stable id for keys and editor selection. */
  id: string
  item: string
  /** Position in percent of the plan image, 0-100. */
  x: number
  y: number
  label?: string
  /** Glow diameter in percent of the plan width. */
  size?: number
}

export type PlanStyle = 'blueprint' | 'ink' | 'plain'

export interface FloorplanConfig {
  label?: string
  /** URL or an uploaded `bg:<id>` reference, like every background field. */
  image?: string
  planStyle?: PlanStyle
  lights?: FloorplanLight[]
  /** Offer the preset chips over the plan (default on). */
  presetBar?: boolean
  /** Tapping the highlighted preset switches its lights off instead of running it again. */
  presetToggleOff?: boolean
  /** Draw a small marker dot at each light (default on) - the tap target. */
  markers?: boolean
  /** Glow size multiplier in percent (100 = normal). */
  glowScale?: number
}

export const DEFAULT_GLOW_SIZE = 22

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * The lights out of a stored config. Every field is untrusted (imports, hand edits): entries
 * without an item are dropped, positions are clamped onto the plan, sizes into sanity.
 */
export function lightsOf(config: FloorplanConfig): FloorplanLight[] {
  if (!Array.isArray(config.lights)) return []
  const lights: FloorplanLight[] = []
  for (let i = 0; i < config.lights.length; i++) {
    const raw = config.lights[i] as unknown
    if (raw === null || typeof raw !== 'object') continue
    const l = raw as Record<string, unknown>
    if (typeof l.item !== 'string' || l.item === '') continue
    const size = num(l.size)
    lights.push({
      id: typeof l.id === 'string' && l.id !== '' ? l.id : `${l.item}#${i}`,
      item: l.item,
      x: clamp(num(l.x) ?? 50, 0, 100),
      y: clamp(num(l.y) ?? 50, 0, 100),
      label: typeof l.label === 'string' && l.label !== '' ? l.label : undefined,
      size: size === undefined ? undefined : clamp(size, 4, 80),
    })
  }
  return lights
}

export function glowScaleOf(config: FloorplanConfig): number {
  return clamp(num(config.glowScale) ?? 100, 25, 400) / 100
}

export function planStyleOf(config: FloorplanConfig): PlanStyle {
  return config.planStyle === 'ink' || config.planStyle === 'plain' ? config.planStyle : 'blueprint'
}

export function newLightId(): string {
  return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/* ---------- geometry ---------- */

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where an `object-fit: contain` image actually paints inside its box. The glow/marker layer
 * is sized to THIS rect, so percent positions refer to the plan and never to the letterboxing.
 * Degenerate inputs (a 0-height box mid-layout, an unloaded image) yield an empty rect rather
 * than NaN styles.
 */
export function containRect(boxW: number, boxH: number, imgW: number, imgH: number): Rect {
  if (!(boxW > 0) || !(boxH > 0) || !(imgW > 0) || !(imgH > 0)) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  const scale = Math.min(boxW / imgW, boxH / imgH)
  const width = imgW * scale
  const height = imgH * scale
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height }
}

/* ---------- what kind of control fits a light's state ---------- */

export type StateKind = 'color' | 'level' | 'onoff' | 'other' | 'none'

/**
 * Decided from the STATE'S SHAPE, deliberately not from a type name: the SSE tracker's `type`
 * field is the state class ("HSB", "Percent", "OnOff"), not the item type, and an item can
 * legitimately hold different state classes over its life. The shape is the truth the popup
 * has to operate on either way.
 */
export function stateKind(state: string | undefined): StateKind {
  if (state === undefined || state === '' || state === 'NULL' || state === 'UNDEF') return 'none'
  const parts = state.split(',')
  if (parts.length === 3 && parts.every((p) => p.trim() !== '' && Number.isFinite(Number(p)))) return 'color'
  if (state === 'ON' || state === 'OFF') return 'onoff'
  if (Number.isFinite(Number(state)) && state.trim() !== '') return 'level'
  return 'other'
}

/* ---------- glow ---------- */

export interface Glow {
  rgb: [number, number, number]
  /** 0-1; 0 = dark (marker only, no glow drawn). */
  intensity: number
}

/** Warm white for non-color lights - a dimmer casts lamplight, not laboratory white. */
const WARM: [number, number, number] = [255, 214, 145]

/**
 * The glow an item's live state casts. Color items glow in their color at their brightness;
 * dimmers and switches glow warm white; everything unknown casts nothing.
 */
export function glowFor(state: string | undefined): Glow | null {
  if (state === undefined || state === '' || state === 'NULL' || state === 'UNDEF') return null
  const parts = state.split(',')
  if (parts.length === 3 && parts.every((p) => p.trim() !== '' && Number.isFinite(Number(p)))) {
    const hsb = parseHsb(state)
    // Full-brightness color even when dim: the color carries the identity, intensity the light.
    return { rgb: hsbToRgb({ ...hsb, b: Math.max(hsb.b, 60) }), intensity: clamp(hsb.b, 0, 100) / 100 }
  }
  if (state === 'ON') return { rgb: WARM, intensity: 1 }
  if (state === 'OFF') return { rgb: WARM, intensity: 0 }
  const n = Number(state)
  if (Number.isFinite(n) && state.trim() !== '') return { rgb: WARM, intensity: clamp(n, 0, 100) / 100 }
  return null
}

/**
 * The radial gradient for one glow. Perceptual: intensity eases with a square root so a light
 * at 20% still visibly glows, the way a dim lamp still reads as "on" in a dark room.
 */
export function glowCss(glow: Glow): string {
  const [r, g, b] = glow.rgb
  const a = Math.sqrt(clamp(glow.intensity, 0, 1))
  const stop = (alpha: number, at: number) => `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)}) ${at}%`
  return `radial-gradient(closest-side, ${stop(0.85 * a, 0)}, ${stop(0.4 * a, 45)}, ${stop(0, 72)})`
}
