/**
 * Reading the openHAB server's clock, for a clock widget set to show it rather than this device's.
 *
 * openHAB exposes no time endpoint and no NTP status of any kind - `/rest/systeminfo` is
 * administrators-only and carries folders, Java version, memory and uptime, nothing about the
 * clock. What every response does carry is the HTTP `Date` header, which is the server's own
 * clock, and `/rest/` declares no required role, so a `HEAD` of it answers on a token-only server
 * as well and costs no body.
 *
 * The header has no sub-second part, so ONE reading pins the server's clock to a one-second box
 * rather than to a point: it is worth about half a second either way, plus half the round trip.
 * That is deliberate and it is enough. The case this exists for is a desktop minutes out of step
 * with an NTP-driven server, where half a second is nothing, and a clock face cannot show it. It
 * does mean a difference under a second cannot be told from no difference at all, so
 * {@link clockDifference} calls those identical rather than inventing a number for them.
 *
 * Everything here is pure. The request, the schedule and the cache live in `store/servertime.ts`.
 */

/** One reading, timed on the device's own clock either side of the request. */
export interface ClockReading {
  /** Device clock when the request went out. */
  sent: number
  /** Device clock when the response came back. */
  received: number
  /** The server's clock as the `Date` header gave it: whole seconds, so already floored. */
  serverSecond: number
}

/** The header's resolution, and therefore the width of the box a reading pins the server to. */
export const HEADER_RESOLUTION_MS = 1000

/**
 * A reading so slow that it says more about the network than about the clock. Half of it lands in
 * the uncertainty, so a stalled request would otherwise quietly widen the answer by seconds.
 */
export const MAX_ROUND_TRIP_MS = 5000

/**
 * How far ahead of this device the server's clock is, in milliseconds, or null when the reading
 * is unusable.
 *
 * The server stamped the header at some moment between the request leaving and the response
 * arriving, so the best guess for the device's clock at that moment is the middle of the two. The
 * server's true clock was somewhere in `[header, header + 1s)`, so the best guess for that is
 * half a second past the header. Both midpoints, which is the choice that makes the worst case as
 * small as it can be.
 */
export function offsetFromReading(reading: ClockReading): number | null {
  const { sent, received, serverSecond } = reading
  if (!Number.isFinite(sent) || !Number.isFinite(received) || !Number.isFinite(serverSecond)) return null
  const roundTrip = received - sent
  if (roundTrip < 0 || roundTrip > MAX_ROUND_TRIP_MS) return null
  return serverSecond + HEADER_RESOLUTION_MS / 2 - (sent + received) / 2
}

/** How wrong {@link offsetFromReading} could be: the header's own box, plus the round trip. */
export function readingUncertaintyMs(reading: ClockReading): number {
  const roundTrip = Math.max(0, reading.received - reading.sent)
  return HEADER_RESOLUTION_MS / 2 + roundTrip / 2
}

/**
 * Below this the two clocks are reported as reading the same time.
 *
 * The `Date` header is whole seconds, so this IS the measurement's resolution: a gap smaller
 * than one second is a gap the two clocks agree to the second on, and the honest thing to say
 * about it is that they are identical rather than to print a number this reading cannot support.
 * Everything the feature is for is far larger - a desktop minutes out of step with its server.
 */
export const SAME_SECOND_MS = 1000

/** How the two clocks stand relative to one another, for the sheet to put into words. */
export interface ClockDifference {
  /** True when the two agree to the second, which is as fine as one reading goes. */
  identical: boolean
  /** True when the OTHER clock is ahead of the one being shown. */
  ahead: boolean
  /** The gap, always positive, rounded to whole milliseconds. */
  ms: number
}

/**
 * The gap between the two clocks, described from the point of view of the one on screen.
 *
 * `offsetMs` is always server minus device. A clock showing the server's time describes the
 * device against it; one showing the device's time describes the server against it, which is the
 * same number with the sign turned over.
 */
export function clockDifference(offsetMs: number, showing: 'server' | 'device'): ClockDifference {
  const gap = showing === 'server' ? -offsetMs : offsetMs
  return { identical: Math.abs(gap) < SAME_SECOND_MS, ahead: gap > 0, ms: Math.round(Math.abs(gap)) }
}

/**
 * Cut-offs for {@link formatDuration}, SMALLEST unit first: the first one the span fits inside
 * wins, so the last entry has to be the catch-all. Ordered the other way round, every span in
 * the world fits inside "less than Infinity days" and comes out as "0 days".
 */
const UNITS: { unit: Intl.NumberFormatOptions['unit']; ms: number; upTo: number }[] = [
  { unit: 'second', ms: 1000, upTo: 90_000 },
  { unit: 'minute', ms: 60_000, upTo: 90 * 60_000 },
  { unit: 'hour', ms: 3_600_000, upTo: 36 * 3_600_000 },
  { unit: 'day', ms: 86_400_000, upTo: Infinity }
]

/**
 * A span of time in the reader's own language: "3 seconds", "5 Minuten", "22 sekundy".
 *
 * `Intl.NumberFormat` in unit style applies each language's own plural rules, so Polish gets
 * sekunda / sekundy / sekund correctly without this project carrying four units times three
 * plural forms times six catalogs of hand-written strings.
 */
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
    // An engine without unit style, or a language tag it will not parse.
    return `${value}`
  }
}

/**
 * The instant a clock should draw, given the offset in force.
 *
 * Split out because it is what the widget, the detail sheet and the tick scheduler all have to
 * agree on: a clock showing server time with no reading yet shows the device's, which is the
 * honest fallback (a wall clock showing nothing is worse than one showing the time this machine
 * believes) and is exactly what the widget did before the setting existed.
 */
export function displayNow(nowMs: number, offsetMs: number | null, source: 'server' | 'device'): number {
  return source === 'server' && offsetMs !== null ? nowMs + offsetMs : nowMs
}

/**
 * Milliseconds until just after the displayed clock next crosses a whole `period`.
 *
 * A clock showing seconds has to turn over ON the second it is showing, not at whatever phase the
 * page happened to load at, and once an offset is applied that second is not the device's. Aiming
 * each tick at the next boundary rather than repeating a fixed interval also stops the display
 * lagging behind as timer callbacks slip.
 *
 * The cushion lands the tick just PAST the boundary: a timer that fires a millisecond early would
 * read, and draw, the second that is about to end.
 */
export function msToNextBoundary(displayedNowMs: number, period: number, cushion = 20): number {
  const into = ((displayedNowMs % period) + period) % period
  return period - into + cushion
}
