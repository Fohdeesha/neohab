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

// The state-shape rule moved to widgets/common when the detail sheet started asking the same
// question. Re-exported so the plan's own modules and tests keep reading it from here.
export { stateKind, type StateKind } from '../common/stateKind'

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
  /** Which way the light throws its glow. Absent = all directions. */
  glowDir?: GlowDirection
}

/** Where a light throws its glow: everywhere, or out of one side only. */
export type GlowDirection = 'all' | 'up' | 'down' | 'left' | 'right'

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
    const dir = glowDirectionOf(l.glowDir)
    lights.push({
      id: typeof l.id === 'string' && l.id !== '' ? l.id : `${l.item}#${i}`,
      item: l.item,
      x: clamp(num(l.x) ?? 50, 0, 100),
      y: clamp(num(l.y) ?? 50, 0, 100),
      label: typeof l.label === 'string' && l.label !== '' ? l.label : undefined,
      size: size === undefined ? undefined : clamp(size, 4, 80),
      glowDir: dir === 'all' ? undefined : dir
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
 * How each direction spills, in ONE table so the box and the gradient inside it can never
 * disagree about where the lamp is: the point the light radiates from, the box that holds the
 * spill as fractions of the omnidirectional diameter, and the transform that puts the lamp
 * itself on the emitting edge rather than in the middle.
 */
const GLOW_DIRECTIONS: Record<GlowDirection, { at: string; wide: number; tall: number; transform: string }> = {
  all: { at: '50% 50%', wide: 1, tall: 1, transform: 'translate(-50%, -50%)' },
  up: { at: '50% 100%', wide: 1, tall: 0.5, transform: 'translate(-50%, -100%)' },
  down: { at: '50% 0%', wide: 1, tall: 0.5, transform: 'translate(-50%, 0)' },
  left: { at: '100% 50%', wide: 0.5, tall: 1, transform: 'translate(-100%, -50%)' },
  right: { at: '0% 50%', wide: 0.5, tall: 1, transform: 'translate(0, -50%)' }
}

/** A stored glow direction, or all directions for anything else. */
export function glowDirectionOf(value: unknown): GlowDirection {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right' ? value : 'all'
}

/**
 * What the editor offers, derived from the same set the renderer draws, so a direction can
 * never exist without a way to pick it. Arrows because these are plan directions - up is the
 * top of the plan, not the ceiling - and an arrow says that in any language. English source
 * strings, translated where they are rendered, like every widget's settings schema.
 */
export const GLOW_DIRECTION_OPTIONS: { value: GlowDirection; label: string }[] = [
  { value: 'all', label: 'All directions' },
  { value: 'up', label: '↑ Up' },
  { value: 'down', label: '↓ Down' },
  { value: 'left', label: '← Left' },
  { value: 'right', label: '→ Right' }
]

export interface GlowGeometry {
  /** Box width, in percent of the plan width. */
  width: number
  /** Fixes the box's shape in pixels, so a glow stays round whatever the plan's aspect. */
  aspectRatio: string
  transform: string
}

/**
 * The box one glow paints in. A directional glow is a half disc of the same radius: half the
 * height (or width) of the omnidirectional box, hung off the side the light throws towards.
 */
export function glowGeometry(direction: GlowDirection | undefined, size: number): GlowGeometry {
  const d = GLOW_DIRECTIONS[glowDirectionOf(direction)]
  return { width: size * d.wide, aspectRatio: `${d.wide} / ${d.tall}`, transform: d.transform }
}

/**
 * The radial gradient for one glow. Perceptual: intensity eases with a square root so a light
 * at 20% still visibly glows, the way a dim lamp still reads as "on" in a dark room.
 *
 * A directional glow radiates from the edge its lamp sits on, and takes its radius from the
 * farthest side - which in the half-height box of glowGeometry is exactly the radius the
 * omnidirectional glow has, so pointing a light somewhere never changes how far it reaches.
 */
export function glowCss(glow: Glow, direction?: GlowDirection): string {
  const [r, g, b] = glow.rgb
  const a = Math.sqrt(clamp(glow.intensity, 0, 1))
  const stop = (alpha: number, at: number) => `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)}) ${at}%`
  const stops = `${stop(0.85 * a, 0)}, ${stop(0.4 * a, 45)}, ${stop(0, 72)}`
  const dir = glowDirectionOf(direction)
  if (dir === 'all') return `radial-gradient(closest-side, ${stops})`
  return `radial-gradient(circle farthest-side at ${GLOW_DIRECTIONS[dir].at}, ${stops})`
}
