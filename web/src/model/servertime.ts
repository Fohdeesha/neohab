export interface ClockReading {
  sent: number
  received: number
  serverSecond: number
}

export const HEADER_RESOLUTION_MS = 1000

export const MAX_ROUND_TRIP_MS = 5000

export function offsetFromReading(reading: ClockReading): number | null {
  const { sent, received, serverSecond } = reading
  if (!Number.isFinite(sent) || !Number.isFinite(received) || !Number.isFinite(serverSecond)) return null
  const roundTrip = received - sent
  if (roundTrip < 0 || roundTrip > MAX_ROUND_TRIP_MS) return null
  return serverSecond + HEADER_RESOLUTION_MS / 2 - (sent + received) / 2
}

export function readingUncertaintyMs(reading: ClockReading): number {
  const roundTrip = Math.max(0, reading.received - reading.sent)
  return HEADER_RESOLUTION_MS / 2 + roundTrip / 2
}

// the Date header is whole seconds, so that IS the resolution: printing a finer figure would invent precision
export const SAME_SECOND_MS = 1000

export interface ClockDifference {
  identical: boolean
  ahead: boolean
  ms: number
}

export function clockDifference(offsetMs: number, showing: 'server' | 'device'): ClockDifference {
  const gap = showing === 'server' ? -offsetMs : offsetMs
  return { identical: Math.abs(gap) < SAME_SECOND_MS, ahead: gap > 0, ms: Math.round(Math.abs(gap)) }
}

// smallest unit first, so the catch-all has to be last or every span comes out as "0 days"
const UNITS: { unit: Intl.NumberFormatOptions['unit']; ms: number; upTo: number }[] = [
  { unit: 'second', ms: 1000, upTo: 90_000 },
  { unit: 'minute', ms: 60_000, upTo: 90 * 60_000 },
  { unit: 'hour', ms: 3_600_000, upTo: 36 * 3_600_000 },
  { unit: 'day', ms: 86_400_000, upTo: Infinity }
]

export function formatDuration(ms: number, lang: string): string {
  const abs = Math.abs(ms)
  const pick = UNITS.find((u) => abs < u.upTo) ?? UNITS[0]
  const value = Math.round(abs / pick.ms)
  try {
    return new Intl.NumberFormat(lang || 'en', {
      style: 'unit',
      unit: pick.unit,
      unitDisplay: 'long',
      maximumFractionDigits: 0
    }).format(value)
  } catch {
    return `${value}`
  }
}

export function displayNow(nowMs: number, offsetMs: number | null, source: 'server' | 'device'): number {
  return source === 'server' && offsetMs !== null ? nowMs + offsetMs : nowMs
}

export function msToNextBoundary(displayedNowMs: number, period: number, cushion = 20): number {
  const into = ((displayedNowMs % period) + period) % period
  return period - into + cushion
}
