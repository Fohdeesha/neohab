/**
 * Pure compass math, separated so it can be unit-checked. A bearing is degrees clockwise
 * from north, normalized into [0, 360).
 */

/** 16-wind rose; index n sits at n * 22.5 degrees. */
export const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

/** Nearest 16-wind cardinal name for a bearing (any number, any sign). */
export function cardinalFor(deg: number): string {
  const norm = ((deg % 360) + 360) % 360
  return CARDINALS[Math.round(norm / 22.5) % 16]
}

/**
 * Bearing from an item state: a number in any range (normalized, so -90 is 270), a numeric
 * string with a trailing unit ("231.4 °" from a Number:Angle item), or a cardinal name
 * ("NW", case-insensitive) from a String item. Anything else - unbound, NULL/UNDEF,
 * garbage - is null and renders as "no reading".
 */
export function bearingFrom(state: string | undefined | null): number | null {
  if (state === undefined || state === null) return null
  const s = String(state).trim()
  if (s === '' || s === 'NULL' || s === 'UNDEF') return null
  const n = parseFloat(s)
  // normalize only out-of-range values: the double modulo smears float error onto
  // readings that were already exact (231.4 came back 231.39999999999998)
  if (Number.isFinite(n)) return n >= 0 && n < 360 ? n : ((n % 360) + 360) % 360
  const i = (CARDINALS as readonly string[]).indexOf(s.toUpperCase())
  return i >= 0 ? i * 22.5 : null
}
