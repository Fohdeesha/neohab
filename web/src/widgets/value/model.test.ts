import { describe, expect, it } from 'vitest'
import {
  alignOf,
  alignable,
  barFraction,
  referenceValue,
  sparkArea,
  sparkPath,
  statPeriodMs,
  styleOf,
  trendDirection,
  trendTone,
  VALUE_PERIODS,
  wantsHistory
} from './model'

const PROTO_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']

describe('styleOf', () => {
  it('reads every style the widget offers', () => {
    for (const style of ['plain', 'stat', 'spark', 'split', 'bar', 'segment', 'pill', 'hero']) {
      expect(styleOf(style)).toBe(style)
    }
  })

  it('falls back to the plain look, which is what a stored value with no style is', () => {
    expect(styleOf(undefined)).toBe('plain')
    expect(styleOf('')).toBe('plain')
    expect(styleOf('nonsense')).toBe('plain')
    expect(styleOf(7)).toBe('plain')
    expect(styleOf(null)).toBe('plain')
  })

  it('falls back for a style named after an Object.prototype member', () => {
    for (const key of PROTO_KEYS) expect(styleOf(key), key).toBe('plain')
  })
})

describe('alignOf', () => {
  it('reads the three alignments and falls back to left', () => {
    expect(alignOf('center')).toBe('center')
    expect(alignOf('right')).toBe('right')
    expect(alignOf(undefined)).toBe('left')
    expect(alignOf('sideways')).toBe('left')
    for (const key of PROTO_KEYS) expect(alignOf(key), key).toBe('left')
  })
})

describe('alignable', () => {
  it('is the column looks, and not the ones that centre themselves', () => {
    for (const style of ['stat', 'spark', 'bar', 'segment'] as const) expect(alignable(style), style).toBe(true)
    for (const style of ['plain', 'split', 'pill', 'hero'] as const) expect(alignable(style), style).toBe(false)
  })
})

describe('wantsHistory', () => {
  it('fetches for a history trend, and for the sparkline whether or not an arrow was asked for', () => {
    expect(wantsHistory({ item: 'x', trend: 'history' })).toBe(true)
    expect(wantsHistory({ item: 'x', style: 'spark', trend: 'none' })).toBe(true)
    expect(wantsHistory({ item: 'x', style: 'spark' })).toBe(true)
  })

  it('does not fetch when there is nothing to fetch for', () => {
    expect(wantsHistory({ item: 'x', trend: 'none' })).toBe(false)
    expect(wantsHistory({ item: 'x', trend: 'item' })).toBe(false)
    expect(wantsHistory({ item: 'x', style: 'stat' })).toBe(false)
  })

  it('never asks the server about an item nobody chose', () => {
    expect(wantsHistory({ item: '', trend: 'history' })).toBe(false)
    expect(wantsHistory({ item: '', style: 'spark' })).toBe(false)
    expect(wantsHistory({ style: 'spark' })).toBe(false)
  })
})

describe('statPeriodMs', () => {
  it('reads the periods it offers', () => {
    expect(statPeriodMs('1h')).toBe(3600_000)
    expect(statPeriodMs('7d')).toBe(7 * 24 * 3600_000)
    expect(statPeriodMs('30d')).toBe(30 * 24 * 3600_000)
  })

  it('falls back to a day for a period it does not have', () => {
    expect(statPeriodMs(undefined)).toBe(VALUE_PERIODS['24h'])
    expect(statPeriodMs('')).toBe(VALUE_PERIODS['24h'])
    expect(statPeriodMs('nonsense')).toBe(VALUE_PERIODS['24h'])
  })

  it('falls back for a period named after an Object.prototype member', () => {
    for (const key of PROTO_KEYS) {
      expect(statPeriodMs(key)).toBe(VALUE_PERIODS['24h'])
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
      { time: 400, value: 9 }
    ]
    expect(referenceValue(rows, 200)).toBe(5)
  })
})

describe('barFraction', () => {
  it('places a reading between the two ends', () => {
    expect(barFraction(50, 0, 100)).toBeCloseTo(0.5)
    expect(barFraction(15, 10, 30)).toBeCloseTo(0.25)
    expect(barFraction(-5, -10, 10)).toBeCloseTo(0.25)
  })

  it('clamps rather than running off either end', () => {
    expect(barFraction(150, 0, 100)).toBe(1)
    expect(barFraction(-40, 0, 100)).toBe(0)
  })

  it('defaults an end nobody set, and never divides by a range that cannot hold a value', () => {
    expect(barFraction(50, undefined, undefined)).toBeCloseTo(0.5)
    // max at or below min: a span of 100 above the minimum, never Infinity or NaN
    for (const max of [0, -20, '0', {}, null]) {
      const f = barFraction(50, 0, max)
      expect(Number.isFinite(f as number), String(max)).toBe(true)
      expect(f).toBeCloseTo(0.5)
    }
  })

  it('has nothing to place when the item has no numeric value', () => {
    expect(barFraction(undefined, 0, 100)).toBeNull()
    expect(barFraction(NaN, 0, 100)).toBeNull()
  })
})

describe('sparkPath', () => {
  const pts = (...rows: [number, number][]) => rows.map(([time, value]) => ({ time, value }))

  it('spans the box in both axes, oldest at the left and highest at the top', () => {
    const d = sparkPath(pts([0, 10], [50, 20], [100, 30]))
    expect(d).toBe('M0,100 L50,50 L100,0')
  })

  it('draws a flat series along the middle rather than dividing by a zero range', () => {
    const d = sparkPath(pts([0, 7], [100, 7]))
    expect(d).toBe('M0,50 L100,50')
    expect(d).not.toContain('NaN')
    expect(d).not.toContain('Infinity')
  })

  it('draws one point as a line across, since a single dot says nothing', () => {
    expect(sparkPath(pts([10, 4]))).toBe('M0,50 L100,50')
  })

  it('has nothing to draw for an empty series', () => {
    expect(sparkPath([])).toBe('')
    expect(sparkArea('')).toBe('')
  })

  it('skips rows that are not numbers rather than poisoning the whole path', () => {
    const rows = [
      { time: 0, value: NaN },
      { time: 50, value: 10 },
      { time: 100, value: 20 }
    ]
    const d = sparkPath(rows)
    expect(d).not.toContain('NaN')
    expect(d).toBe('M0,100 L100,0')
  })

  it('closes the area down to the floor so the wash sits under the line', () => {
    expect(sparkArea('M0,10 L100,20')).toBe('M0,10 L100,20 L100,100 L0,100 Z')
  })
})
