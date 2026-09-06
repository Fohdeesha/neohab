export interface Rgb {
  r: number
  g: number
  b: number
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)/i

function channel(raw: string): number | null {
  const pct = raw.endsWith('%')
  const n = Number(pct ? raw.slice(0, -1) : raw)
  if (!Number.isFinite(n)) return null
  return clamp255(pct ? (n / 100) * 255 : n)
}

const clamp255 = (n: number): number => Math.max(0, Math.min(255, n))

export function parseColor(value: string | undefined): Rgb | null {
  if (!value) return null
  const v = value.trim().toLowerCase()

  const hex = HEX.exec(v)
  if (hex) {
    const h = hex[1]
    const full = h.length <= 4 ? [...h].map((c) => c + c).join('') : h
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16)
    }
  }

  const rgb = RGB.exec(v)
  if (rgb) {
    const r = channel(rgb[1])
    const g = channel(rgb[2])
    const b = channel(rgb[3])
    if (r === null || g === null || b === null) return null
    return { r, g, b }
  }

  return null
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export function contrastOf(a: string | undefined, b: string | undefined): number | null {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return null
  return contrastRatio(ca, cb)
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA-large' | 'fail'

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA-large'
  return 'fail'
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }

export const DARK_INK = '#10161c'
const DARK_INK_RGB: Rgb = { r: 0x10, g: 0x16, b: 0x1c }

export function readableInk(background: string | undefined): string | null {
  const bg = parseColor(background)
  if (!bg) return null
  // compared against the ink actually returned, not pure black: on a mid-tone red the two disagree
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, DARK_INK_RGB) ? '#ffffff' : DARK_INK
}

export interface ContrastPair {
  label: string
  fg: string
  bg: string
  large?: boolean
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  { label: 'Text on the page', fg: 'text', bg: 'bg' },
  { label: 'Text on a widget', fg: 'text', bg: 'surface' },
  { label: 'Widget names', fg: 'text-dim', bg: 'surface' },
  { label: 'Text on a button', fg: 'text', bg: 'surface-2' },
  { label: 'Accent on a widget', fg: 'primary', bg: 'surface', large: true }
]
