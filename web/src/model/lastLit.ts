/**
 * The brightness a colour light was last seen lit at, so an On button can put it back.
 *
 * openHAB's Color item already remembers half of this for free. Commanding OFF leaves the state at
 * `H,S,0` - hue and saturation intact - which is why the Off button sends OFF rather than `0,0,0`,
 * and why every other UI still shows the colour the light will come back to while it is dark.
 * Measured on 4.3.7 and 5.2.1 alike, and it is `ColorItem.setState` in core, not a binding's
 * behaviour. What openHAB does NOT keep is the brightness: ON is defined there as `H,S,100`, so a
 * lamp sitting at 40% would always come back at full.
 *
 * So exactly one number per item is remembered, on the device, beside the kiosk and theme settings.
 * No openHAB item, no configuration write, nothing that reaches a backup. Any device that has seen
 * the lamp lit can restore it, including one that did not switch it off; a device that never has
 * falls back to full, which is what openHAB's own ON would have done anyway.
 *
 * Pure - the store above owns the storage and decides when to write.
 */
import { emptyMap, lookup } from './lookup'

/** What On sends for a lamp this device has never seen lit: openHAB's own answer for ON. */
export const FULL_BRIGHTNESS = 100

/**
 * How many lamps a device remembers. Generous enough that no real house reaches it, bounded so a
 * map that only ever grows cannot sit in someone's browser for years. The oldest go first.
 */
export const LIT_CAP = 200

/** A brightness worth remembering: lit, and on the scale openHAB uses. */
function usable(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 100
}

/** The brightness to restore this lamp to. */
export function litOf(map: Record<string, number>, item: string): number {
  const v = lookup(map, item)
  return usable(v) ? v : FULL_BRIGHTNESS
}

/**
 * Record what a lamp is lit at, returning the map to keep.
 *
 * The SAME map comes back when nothing changed, so the caller can tell a no-op from a write
 * without comparing anything: a fading strip reports a burst of states, and all but the last are
 * about to be replaced.
 */
export function noteLit(map: Record<string, number>, item: string, brightness: number): Record<string, number> {
  if (!item || !usable(brightness)) return map
  if (lookup(map, item) === brightness) return map
  const out = emptyMap<number>()
  // Rebuilt rather than mutated so the value is pure, and so re-noting a lamp moves it to the end:
  // the cap then drops the lamps this device has gone longest without seeing.
  for (const [k, v] of Object.entries(map)) if (k !== item) out[k] = v
  out[item] = brightness
  const keys = Object.keys(out)
  for (const k of keys.slice(0, Math.max(0, keys.length - LIT_CAP))) delete out[k]
  return out
}

/**
 * Read what was stored. localStorage holds whatever anything ever put there - another version of
 * this app, a hand edit, a half-written value - so every entry is checked rather than trusted, and
 * anything unreadable is simply an empty memory.
 */
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
  // An item may legally be named `__proto__` or `constructor`; JSON.parse makes both own
  // properties, and assigning them onto a prototype-free map keeps them as plain data.
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (usable(v)) out[k] = v
  const keys = Object.keys(out)
  for (const k of keys.slice(0, Math.max(0, keys.length - LIT_CAP))) delete out[k]
  return out
}

export function serialiseLit(map: Record<string, number>): string {
  return JSON.stringify(map)
}
