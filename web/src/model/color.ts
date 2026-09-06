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

// a preset command is not an item state - a scene can carry any hue at all, so normalise before doing
// arithmetic
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
    [c, 0, x]
  ][seg]
  const to255 = (n: number) => Math.round((n + m) * 255)
  return [to255(r), to255(g), to255(bl)]
}

export function hsbToCss(hsb: Hsb): string {
  const [r, g, b] = hsbToRgb(hsb)
  return `rgb(${r}, ${g}, ${b})`
}

export function sameColor(a: Hsb, b: Hsb): boolean {
  const ra = hsbToRgb(a)
  const rb = hsbToRgb(b)
  return ra.every((v, i) => Math.abs(v - rb[i]) <= 12)
}
