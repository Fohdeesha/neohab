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

export function hsbToRgb({ h, s, b }: Hsb): [number, number, number] {
  const sat = s / 100
  const val = b / 100
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
