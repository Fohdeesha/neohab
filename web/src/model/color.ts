/**
 * HSB color math, shared by the color widget, the floor plan's glow layer and the preset
 * model. openHAB Color items speak "H,S,B" (H 0-360, S/B 0-100); everything here parses,
 * converts and compares that representation. Pure: anything may import this.
 */

export interface Hsb {
  h: number
  s: number
  b: number
}

export function parseHsb(state: string | undefined): Hsb {
  if (!state) return { h: 0, s: 0, b: 0 }
  const [h, s, b] = state.split(',').map(Number)
  return { h: h || 0, s: s || 0, b: b || 0 }
}

/**
 * The one place a stored H,S,B triple is made safe to do arithmetic with, because every path
 * through this module runs through it.
 *
 * A live Color item cannot be out of range - openHAB's `HSBType.validateValue` enforces
 * `0 <= h < 360` - but a **preset command is not an item state**. A scene rule's action is
 * editable in Main UI, writable by any script and carried verbatim by a backup, and
 * `isImportableSceneRule` checks the uid prefix and the neohab tag without ever reading the
 * commands. So `-10,50,50` is a thing an imported backup can hand this module.
 *
 * A negative hue used to be fatal rather than merely wrong: `Math.floor(-10 / 60) % 6` is -1 in
 * JavaScript, so the segment table below was indexed at -1 and destructuring `undefined` threw.
 * One route reached it from a `setTimeout` (`store/settling.ts` dropUnconfirmed), where no
 * boundary catches anything.
 *
 * Hue wraps because it is an angle and wrapping is what an angle means. Saturation and brightness
 * clamp because they are proportions, and a proportion above 100 has no meaning to round-trip.
 */
function hue(h: number): number {
  return Number.isFinite(h) ? ((h % 360) + 360) % 360 : 0
}

function proportion(v: number): number {
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0
}

export function hsbToRgb(hsb: Hsb): [number, number, number] {
  const h = hue(hsb.h)
  const sat = proportion(hsb.s) / 100
  const val = proportion(hsb.b) / 100
  const c = val * sat
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = val - c
  const seg = Math.floor(h / 60) % 6
  const [r, g, bl] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg]
  const to255 = (n: number) => Math.round((n + m) * 255)
  return [to255(r), to255(g), to255(bl)]
}

/** HSB (H 0-360, S/B 0-100) to a CSS rgb() string for the swatch preview. */
export function hsbToCss(hsb: Hsb): string {
  const [r, g, b] = hsbToRgb(hsb)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * "Same color" in RGB space. HSB distance is the wrong measure here: at low saturation or
 * brightness the hue a device echoes back is arbitrary (white is white at any hue), and
 * 8-bit-quantizing bindings shift H/S by a point or two while the actual color is identical.
 */
export function sameColor(a: Hsb, b: Hsb): boolean {
  const ra = hsbToRgb(a)
  const rb = hsbToRgb(b)
  return ra.every((v, i) => Math.abs(v - rb[i]) <= 12)
}
