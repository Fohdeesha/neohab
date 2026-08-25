/**
 * The stat widget's arithmetic.
 *
 * This module had no test at all, although the work that added it recorded a count of checks -
 * they lived in a session scratchpad and never reached the repo, so a contributor cloning it ran
 * none of them. The period lookup below is the reason it was noticed.
 */
import { describe, expect, it } from 'vitest'
import { referenceValue, STAT_PERIODS, statPeriodMs, trendDirection, trendTone } from './stat'

describe('statPeriodMs', () => {
  it('reads the periods it offers', () => {
    expect(statPeriodMs('1h')).toBe(3600_000)
    expect(statPeriodMs('7d')).toBe(7 * 24 * 3600_000)
  })

  it('falls back to a day for a period it does not have', () => {
    expect(statPeriodMs(undefined)).toBe(STAT_PERIODS['24h'])
    expect(statPeriodMs('')).toBe(STAT_PERIODS['24h'])
    expect(statPeriodMs('nonsense')).toBe(STAT_PERIODS['24h'])
  })

  /*
   * The period is stored widget configuration, so the key is not one this code chose. A bare
   * `STAT_PERIODS[key]` walks the prototype chain, and because a function is not nullish the
   * `?? STAT_PERIODS['24h']` never fires: `Date.now() - <function>` is NaN, and
   * `new Date(NaN).toISOString()` throws inside the history fetch. The widget catches it, so the
   * trend arrow silently never appears and nothing says why.
   */
  it('falls back for a period named after an Object.prototype member', () => {
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(statPeriodMs(key)).toBe(STAT_PERIODS['24h'])
      expect(Number.isFinite(statPeriodMs(key))).toBe(true)
    }
  })
})

describe('trendDirection', () => {
  it('calls a rise and a fall', () => {
    expect(trendDirection(110, 100)).toBe('up')
    expect(trendDirection(90, 100)).toBe('down')
  })

  it('reads a wobble in the last digit as flat', () => {
    expect(trendDirection(100.4, 100)).toBe('flat')
    expect(trendDirection(99.6, 100)).toBe('flat')
    expect(trendDirection(100.6, 100)).toBe('up')
  })

  it('has no scale to be relative to at zero, so any change counts', () => {
    expect(trendDirection(0, 0)).toBe('flat')
    expect(trendDirection(0.001, 0)).toBe('up')
  })

  it('answers null rather than an arrow when either side is not a number', () => {
    expect(trendDirection(NaN, 100)).toBeNull()
    expect(trendDirection(100, NaN)).toBeNull()
    expect(trendDirection(Infinity, 100)).toBeNull()
  })
})

describe('trendTone', () => {
  it('judges the same direction differently depending on what good means here', () => {
    expect(trendTone('down', 'down')).toBe('good')
    expect(trendTone('down', 'up')).toBe('bad')
    expect(trendTone('up', 'up')).toBe('good')
    expect(trendTone('up', 'down')).toBe('bad')
  })

  it('carries no judgement when flat, or when none was configured', () => {
    expect(trendTone('flat', 'up')).toBe('neutral')
    expect(trendTone('up', undefined)).toBe('neutral')
    expect(trendTone('up', 'sideways')).toBe('neutral')
  })
})

describe('referenceValue', () => {
  const pts = (...rows: [number, number][]) => rows.map(([time, value]) => ({ time, value }))

  it('takes the value in force at the start of the window', () => {
    expect(referenceValue(pts([100, 5], [200, 7], [300, 9]), 250)).toBe(7)
  })

  it('takes the earliest known value when the series begins after the window', () => {
    expect(referenceValue(pts([500, 5], [600, 7]), 100)).toBe(5)
  })

  it('answers undefined for an empty series', () => {
    expect(referenceValue([], 100)).toBeUndefined()
  })

  it('skips rows that are not numbers rather than reporting NaN', () => {
    const rows = [
      { time: 100, value: NaN },
      { time: 150, value: 5 },
      { time: 400, value: 9 },
    ]
    expect(referenceValue(rows, 200)).toBe(5)
  })
})
