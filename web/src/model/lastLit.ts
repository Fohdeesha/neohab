import { emptyMap, lookup } from './lookup'

export const FULL_BRIGHTNESS = 100

export const LIT_CAP = 200

function usable(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100
}

export function litOf(map: Record<string, number>, item: string): number {
  const v = lookup(map, item)
  return usable(v) ? v : FULL_BRIGHTNESS
}

export function noteLit(map: Record<string, number>, item: string, brightness: number): Record<string, number> {
  if (!item || !usable(brightness)) return map
  if (lookup(map, item) === brightness) return map
  const out = emptyMap<number>()
  for (const [k, v] of Object.entries(map)) if (k !== item) out[k] = v
  out[item] = brightness
  const keys = Object.keys(out)
  for (const k of keys.slice(0, Math.max(0, keys.length - LIT_CAP))) delete out[k]
  return out
}

export function parseLit(raw: string | null | undefined): Record<string, number> {
  const out = emptyMap<number>()
  if (!raw) return out
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return out
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return out
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (usable(v)) out[k] = v
  const keys = Object.keys(out)
  for (const k of keys.slice(0, Math.max(0, keys.length - LIT_CAP))) delete out[k]
  return out
}

export function serialiseLit(map: Record<string, number>): string {
  return JSON.stringify(map)
}
