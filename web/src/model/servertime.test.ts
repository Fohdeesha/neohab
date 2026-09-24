import { describe, expect, it } from 'vitest'
import {
  SAME_SECOND_MS,
  MAX_ROUND_TRIP_MS,
  clockDifference,
  displayNow,
  formatDuration,
  msToNextBoundary,
  offsetFromReading
} from './servertime'

describe('one reading of the server clock', () => {
  it('puts the server half a second past the header, and the device midway through the request', () => {
    expect(offsetFromReading({ sent: 1000, received: 1100, serverSecond: 5000 })).toBe(4450)
  })

  it('reads two clocks that agree as agreeing', () => {
    expect(offsetFromReading({ sent: 4000, received: 4000, serverSecond: 4000 })).toBe(500)
  })

  it('refuses a reading that says more about the network than the clock', () => {
    expect(offsetFromReading({ sent: 0, received: MAX_ROUND_TRIP_MS + 1, serverSecond: 0 })).toBeNull()
    expect(offsetFromReading({ sent: 0, received: MAX_ROUND_TRIP_MS - 1, serverSecond: 0 })).not.toBeNull()
  })

  it('refuses a reading that could not have happened', () => {
    expect(offsetFromReading({ sent: 5000, received: 1000, serverSecond: 5000 })).toBeNull()
    expect(offsetFromReading({ sent: 1000, received: 1100, serverSecond: NaN })).toBeNull()
    expect(offsetFromReading({ sent: NaN, received: 1100, serverSecond: 5000 })).toBeNull()
    expect(offsetFromReading({ sent: 1000, received: NaN, serverSecond: 5000 })).toBeNull()
  })
})

describe('putting the gap between two clocks into words', () => {
  it('describes the device when the server is what is on screen', () => {
    expect(clockDifference(3000, 'server')).toEqual({ identical: false, ahead: false, ms: 3000 })
    expect(clockDifference(-3000, 'server')).toEqual({ identical: false, ahead: true, ms: 3000 })
  })

  it('and the server when the device is', () => {
    expect(clockDifference(3000, 'device')).toEqual({ identical: false, ahead: true, ms: 3000 })
    expect(clockDifference(-3000, 'device')).toEqual({ identical: false, ahead: false, ms: 3000 })
  })

  it('calls anything one reading cannot resolve identical', () => {
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
    expect(displayNow(1000, null, 'server')).toBe(1000)
  })
})

describe('the tick', () => {
  it('lands just after the next boundary, never a moment before it', () => {
    expect(msToNextBoundary(1_000_300, 1000, 20)).toBe(720)
    expect(msToNextBoundary(1_000_999, 1000, 20)).toBe(21)
  })

  it('waits a whole period when it is already exactly on one', () => {
    expect(msToNextBoundary(60_000, 60_000, 20)).toBe(60_020)
  })

  it('aims at the DISPLAYED boundary, which an offset moves', () => {
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
