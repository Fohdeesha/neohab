/**
 * Colour contrast, for the two places the app has to reason about legibility rather than taste:
 *
 *  - picking the ink drawn on top of an accent colour. A tile painted in the theme accent, a
 *    label chip, a stat badge: all of them used to hardcode white text, which is right for a
 *    mid-to-dark accent and unreadable for a light one (amber, lime, pale cyan). Now the ink is
 *    derived from the colour it sits on.
 *  - telling someone editing a theme whether the colours they picked can actually be read.
 *
 * Pure, dependency-free and unit-tested. Only the colour forms a person can type into the theme
 * editor or a theme file are understood - hex and rgb()/rgba(). Anything else (a named colour, a
 * gradient, `color-mix(...)`, a var reference) returns null, and every caller treats null as
 * "cannot judge this" and falls back to the safe default rather than guessing.
 */

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

/** Parse a CSS colour into 8-bit RGB, or null when it is not a form we can read. */
export function parseColor(value: string | undefined): Rgb | null {
  if (!value) return null
  const v = value.trim().toLowerCase()

  const hex = HEX.exec(v)
  if (hex) {
    const h = hex[1]
    // #rgb and #rgba expand each digit; the alpha digits are parsed and ignored (contrast is
    // judged against the colour itself, since what is behind it is not knowable here).
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

/** WCAG relative luminance (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Contrast between two CSS colour strings, or null when either cannot be read. */
export function contrastOf(a: string | undefined, b: string | undefined): number | null {
  const ca = parseColor(a)
  const cb = parseColor(b)
  if (!ca || !cb) return null
  return contrastRatio(ca, cb)
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA-large' | 'fail'

/**
 * Which WCAG bar a ratio clears, for normal-size text. 'AA-large' means it is only good enough
 * for large or bold text, which most of the places these colours meet actually are (a widget's
 * reading, a tile title), so it is reported honestly rather than as a failure.
 */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA-large'
  return 'fail'
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }

/**
 * Readable ink for text drawn on `background`: white or a near-black, whichever the eye can
 * actually read there. Near-black rather than pure black because a solid #000 on a mid colour
 * reads as a hole; this keeps a trace of the surface in it.
 *
 * Returns null when the background cannot be parsed, so the caller keeps whatever it had,
 * never a guess that might be worse than the status quo.
 */
export const DARK_INK = '#10161c'
const DARK_INK_RGB: Rgb = { r: 0x10, g: 0x16, b: 0x1c }

export function readableInk(background: string | undefined): string | null {
  const bg = parseColor(background)
  if (!bg) return null
  // Compared against the ink that is actually returned, not against pure black. They are not the
  // same: on a mid-tone red, black scores higher than white while #10161c scores lower, so
  // deciding with one and returning the other picks the less readable of the two.
  return contrastRatio(bg, WHITE) >= contrastRatio(bg, DARK_INK_RGB) ? '#ffffff' : DARK_INK
}

/** The pairs the theme editor checks, and what each one is for. */
export interface ContrastPair {
  label: string
  /** Foreground and background token keys. */
  fg: string
  bg: string
  /** True where the text involved is large or bold, so AA-large is genuinely enough. */
  large?: boolean
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  { label: 'Text on the page', fg: 'text', bg: 'bg' },
  { label: 'Text on a widget', fg: 'text', bg: 'surface' },
  { label: 'Widget names', fg: 'text-dim', bg: 'surface' },
  { label: 'Text on a button', fg: 'text', bg: 'surface-2' },
  { label: 'Accent on a widget', fg: 'primary', bg: 'surface', large: true }
]
