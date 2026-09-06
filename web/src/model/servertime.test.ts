/**
 * Reading the openHAB server's clock off the `Date` header.
 *
 * The arithmetic is small but it decides what a clock face shows, and the one thing it must never
 * do is claim precision the header cannot carry: a difference under a second is reported as being
 * in step rather than rounded into a number somebody would take literally.
 */
import { describe, expect, it } from 'vitest'
import {
  HEADER_RESOLUTION_MS,
  SAME_SECOND_MS,
  MAX_ROUND_TRIP_MS,
  clockDifference,
  displayNow,
  formatDuration,
  msToNextBoundary,
  offsetFromReading,
  readingUncertaintyMs
} from './servertime'

describe('one reading of the server clock', () => {
  it('puts the server half a second past the header, and the device midway through the request', () => {
    // Sent at 1000, back at 1100, header says the server had ticked to 5000.
    // Server ~5500, device ~1050, so the server is 4450 ahead.
    expect(offsetFromReading({ sent: 1000, received: 1100, serverSecond: 5000 })).toBe(4450)
  })

  it('reads two clocks that agree as agreeing', () => {
    // A request at 4000 answered at 4000, header 4000: the server's true time is somewhere in
    // [4000, 5000), so the middle of that box is half a second on. That half second is the
    // header's own resolution and there is no way to do better from one reading.
    expect(offsetFromReading({ sent: 4000, received: 4000, serverSecond: 4000 })).toBe(500)
  })

  it('never guesses further out than half the header plus half the trip', () => {
    // Whatever the true offset was, the estimate is within this of it.
    const reading = { sent: 1000, received: 1120, serverSecond: 5000 }
    expect(readingUncertaintyMs(reading)).toBe(HEADER_RESOLUTION_MS / 2 + 60)
  })

  it('refuses a reading that says more about the network than the clock', () => {
    // Half a stalled round trip lands in the uncertainty, so a long one is not worth having.
    expect(offsetFromReading({ sent: 0, received: MAX_ROUND_TRIP_MS + 1, serverSecond: 0 })).toBeNull()
    expect(offsetFromReading({ sent: 0, received: MAX_ROUND_TRIP_MS - 1, serverSecond: 0 })).not.toBeNull()
  })

  it('refuses a reading that could not have happened', () => {
    // A device clock stepped mid-request, or a header that would not parse.
    expect(offsetFromReading({ sent: 5000, received: 1000, serverSecond: 5000 })).toBeNull()
    expect(offsetFromReading({ sent: 1000, received: 1100, serverSecond: NaN })).toBeNull()
    expect(offsetFromReading({ sent: NaN, received: 1100, serverSecond: 5000 })).toBeNull()
    expect(offsetFromReading({ sent: 1000, received: NaN, serverSecond: 5000 })).toBeNull()
  })
})

describe('putting the gap between two clocks into words', () => {
  it('describes the device when the server is what is on screen', () => {
    // The server is 3s ahead, so the device is 3s behind it.
    expect(clockDifference(3000, 'server')).toEqual({ identical: false, ahead: false, ms: 3000 })
    expect(clockDifference(-3000, 'server')).toEqual({ identical: false, ahead: true, ms: 3000 })
  })

  it('and the server when the device is', () => {
    // The same measurement, described from the other side.
    expect(clockDifference(3000, 'device')).toEqual({ identical: false, ahead: true, ms: 3000 })
    expect(clockDifference(-3000, 'device')).toEqual({ identical: false, ahead: false, ms: 3000 })
  })

  it('calls anything one reading cannot resolve identical', () => {
    // Printing "1 second" for a gap the measurement cannot tell from zero would be inventing
    // precision the Date header does not carry.
    for (const gap of [0, 400, -400, SAME_SECOND_MS - 1, -(SAME_SECOND_MS - 1)]) {
      expect(clockDifference(gap, 'server').identical, String(gap)).toBe(true)
    }
    expect(clockDifference(SAME_SECOND_MS, 'server').identical).toBe(false)
  })
})

describe('a span of time in the reader’s language', () => {
  it('counts in whichever unit reads best', () => {
    expect(formatDuration(3000, 'en')).toBe('3 seconds')
    expect(formatDuration(89_000, 'en')).toBe('89 seconds')
    expect(formatDuration(240_000, 'en')).toBe('4 minutes')
    expect(formatDuration(7_200_000, 'en')).toBe('2 hours')
    expect(formatDuration(3 * 86_400_000, 'en')).toBe('3 days')
  })

  it('gets each language’s plurals right without a catalog of them', () => {
    // Intl carries the plural rules, which is four units times three forms times six languages
    // this project does not have to hand-write or keep correct.
    expect(formatDuration(1000, 'en')).toBe('1 second')
    expect(formatDuration(2000, 'de')).toBe('2 Sekunden')
    expect(formatDuration(1000, 'pl')).toBe('1 sekunda')
    expect(formatDuration(2000, 'pl')).toBe('2 sekundy')
    expect(formatDuration(5000, 'pl')).toBe('5 sekund')
  })

  it('describes a gap whichever way it points', () => {
    expect(formatDuration(-3000, 'en')).toBe('3 seconds')
  })

  it('falls back to a bare number rather than throwing on a tag it cannot parse', () => {
    expect(formatDuration(3000, 'not a language')).toBe('3')
  })
})

describe('which clock is drawn', () => {
  it('uses the offset only when the tile asked for the server', () => {
    expect(displayNow(1000, 4450, 'server')).toBe(5450)
    expect(displayNow(1000, 4450, 'device')).toBe(1000)
  })

  it('shows this device until a reading lands', () => {
    // A wall clock showing nothing is worse than one showing the time this machine believes, and
    // it is what the widget did before the setting existed.
    expect(displayNow(1000, null, 'server')).toBe(1000)
  })
})

describe('the tick', () => {
  it('lands just after the next boundary, never a moment before it', () => {
    // A timer firing a millisecond early reads, and draws, the second that is about to end.
    expect(msToNextBoundary(1_000_300, 1000, 20)).toBe(720)
    expect(msToNextBoundary(1_000_999, 1000, 20)).toBe(21)
  })

  it('waits a whole period when it is already exactly on one', () => {
    expect(msToNextBoundary(60_000, 60_000, 20)).toBe(60_020)
  })

  it('aims at the DISPLAYED boundary, which an offset moves', () => {
    // The device is at x, the server 400ms further on, so the server's second turns over 400ms
    // sooner than this machine's does.
    const device = 1_000_000
    const shown = displayNow(device, 400, 'server')
    expect(msToNextBoundary(shown, 1000, 0)).toBe(600)
    expect(msToNextBoundary(device, 1000, 0)).toBe(1000)
  })

  it('never returns a negative wait, whatever the clock says', () => {
    for (const t of [-1, -999, -1000, -60_001, 0]) {
      expect(msToNextBoundary(t, 1000, 20), String(t)).toBeGreaterThan(0)
    }
  })
})
