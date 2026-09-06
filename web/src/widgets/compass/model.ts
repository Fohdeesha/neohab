export const CARDINALS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const

export function cardinalFor(deg: number): string {
  const norm = ((deg % 360) + 360) % 360
  return CARDINALS[Math.round(norm / 22.5) % 16]
}

export function bearingFrom(state: string | undefined | null): number | null {
  if (state === undefined || state === null) return null
  const s = String(state).trim()
  if (s === '' || s === 'NULL' || s === 'UNDEF') return null
  const n = parseFloat(s)
  if (Number.isFinite(n)) return n >= 0 && n < 360 ? n : ((n % 360) + 360) % 360
  const i = (CARDINALS as readonly string[]).indexOf(s.toUpperCase())
  return i >= 0 ? i * 22.5 : null
}
