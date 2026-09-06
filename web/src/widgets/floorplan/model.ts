import { parseHsb, hsbToRgb } from '../../model/color'

export { stateKind, type StateKind } from '../common/stateKind'

export interface FloorplanLight {
  id: string
  item: string
  x: number
  y: number
  label?: string
  size?: number
  glowDir?: GlowDirection
}

export type GlowDirection = 'all' | 'up' | 'down' | 'left' | 'right'

export type PlanStyle = 'blueprint' | 'ink' | 'plain'

export interface FloorplanConfig {
  label?: string
  image?: string
  planStyle?: PlanStyle
  lights?: FloorplanLight[]
  presetBar?: boolean
  presetToggleOff?: boolean
  markers?: boolean
  glowScale?: number
}

export const DEFAULT_GLOW_SIZE = 22

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

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

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export function containRect(boxW: number, boxH: number, imgW: number, imgH: number): Rect {
  if (!(boxW > 0) || !(boxH > 0) || !(imgW > 0) || !(imgH > 0)) {
    return { left: 0, top: 0, width: 0, height: 0 }
  }
  const scale = Math.min(boxW / imgW, boxH / imgH)
  const width = imgW * scale
  const height = imgH * scale
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height }
}

export interface Glow {
  rgb: [number, number, number]
  intensity: number
}

const WARM: [number, number, number] = [255, 214, 145]

export function glowFor(state: string | undefined): Glow | null {
  if (state === undefined || state === '' || state === 'NULL' || state === 'UNDEF') return null
  const parts = state.split(',')
  if (parts.length === 3 && parts.every((p) => p.trim() !== '' && Number.isFinite(Number(p)))) {
    const hsb = parseHsb(state)
    return { rgb: hsbToRgb({ ...hsb, b: Math.max(hsb.b, 60) }), intensity: clamp(hsb.b, 0, 100) / 100 }
  }
  if (state === 'ON') return { rgb: WARM, intensity: 1 }
  if (state === 'OFF') return { rgb: WARM, intensity: 0 }
  const n = Number(state)
  if (Number.isFinite(n) && state.trim() !== '') return { rgb: WARM, intensity: clamp(n, 0, 100) / 100 }
  return null
}

const GLOW_DIRECTIONS: Record<GlowDirection, { at: string; wide: number; tall: number; transform: string }> = {
  all: { at: '50% 50%', wide: 1, tall: 1, transform: 'translate(-50%, -50%)' },
  up: { at: '50% 100%', wide: 1, tall: 0.5, transform: 'translate(-50%, -100%)' },
  down: { at: '50% 0%', wide: 1, tall: 0.5, transform: 'translate(-50%, 0)' },
  left: { at: '100% 50%', wide: 0.5, tall: 1, transform: 'translate(-100%, -50%)' },
  right: { at: '0% 50%', wide: 0.5, tall: 1, transform: 'translate(0, -50%)' }
}

export function glowDirectionOf(value: unknown): GlowDirection {
  return value === 'up' || value === 'down' || value === 'left' || value === 'right' ? value : 'all'
}

export const GLOW_DIRECTION_OPTIONS: { value: GlowDirection; label: string }[] = [
  { value: 'all', label: 'All directions' },
  { value: 'up', label: '↑ Up' },
  { value: 'down', label: '↓ Down' },
  { value: 'left', label: '← Left' },
  { value: 'right', label: '→ Right' }
]

export interface GlowGeometry {
  width: number
  aspectRatio: string
  transform: string
}

export function glowGeometry(direction: GlowDirection | undefined, size: number): GlowGeometry {
  const d = GLOW_DIRECTIONS[glowDirectionOf(direction)]
  return { width: size * d.wide, aspectRatio: `${d.wide} / ${d.tall}`, transform: d.transform }
}

export function glowCss(glow: Glow, direction?: GlowDirection): string {
  const [r, g, b] = glow.rgb
  const a = Math.sqrt(clamp(glow.intensity, 0, 1))
  const stop = (alpha: number, at: number) => `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)}) ${at}%`
  const stops = `${stop(0.85 * a, 0)}, ${stop(0.4 * a, 45)}, ${stop(0, 72)}`
  const dir = glowDirectionOf(direction)
  if (dir === 'all') return `radial-gradient(closest-side, ${stops})`
  return `radial-gradient(circle farthest-side at ${GLOW_DIRECTIONS[dir].at}, ${stops})`
}
