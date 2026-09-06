import { describe, expect, it } from 'vitest'
import {
  PERIODS,
  PERIOD_CHIPS,
  PERIOD_IDS,
  chipPeriods,
  decimate,
  effectiveSeries,
  effectiveThresholds,
  isPeriod,
  periodMs,
  type ChartConfig
} from './model'

describe('effectiveSeries', () => {
  it('keeps the configured series', () => {
    expect(effectiveSeries({ series: [{ item: 'A' }, { item: 'B', label: 'Bee' }] })).toEqual([{ item: 'A' }, { item: 'B', label: 'Bee' }])
  })

  it('falls back to the legacy single item', () => {
    expect(effectiveSeries({ item: 'Legacy' })).toEqual([{ item: 'Legacy' }])
  })

  it('survives a series list that is not a list', () => {
    for (const series of [{}, 'A', 42, null] as unknown as ChartConfig['series'][]) {
      expect(() => effectiveSeries({ series }), String(series)).not.toThrow()
      expect(effectiveSeries({ series })).toEqual([])
    }
  })

  it('drops rows that name no item, and a non-string legacy item', () => {
    expect(effectiveSeries({ series: [{ item: '' }, null as never, { item: 'A' }] })).toEqual([{ item: 'A' }])
    expect(effectiveSeries({ item: 7 as unknown as string })).toEqual([])
  })
})

describe('effectiveThresholds', () => {
  it('survives a thresholds value that is not a list', () => {
    for (const thresholds of [{}, 'none', 3] as unknown as ChartConfig['thresholds'][]) {
      expect(() => effectiveThresholds({ thresholds }), String(thresholds)).not.toThrow()
      expect(effectiveThresholds({ thresholds })).toEqual([])
    }
    expect(effectiveThresholds({ thresholds: [{ from: 10 }, null as never] })).toEqual([{ from: 10 }])
  })
})

describe('periods', () => {
  it('offers the short ranges a live reading is read at', () => {
    expect(PERIODS['3h']).toBe(3 * 3600e3)
    expect(PERIODS['6h']).toBe(6 * 3600e3)
    expect(PERIOD_CHIPS).toContain('3h')
    expect(PERIOD_CHIPS).toContain('6h')
  })

  it('lists every id shortest first, so a picker reads in order', () => {
    expect(PERIOD_IDS).toEqual(Object.keys(PERIODS))
    const spans = PERIOD_IDS.map((id) => PERIODS[id])
    expect(spans).toEqual([...spans].sort((a, b) => a - b))
  })

  it('offers only ranges that exist', () => {
    for (const id of PERIOD_CHIPS) expect(isPeriod(id), id).toBe(true)
  })

  it('falls back to a day for a period id that names nothing', () => {
    expect(periodMs('1h')).toBe(3600e3)
    expect(periodMs(undefined)).toBe(PERIODS['24h'])
    expect(periodMs('made up')).toBe(PERIODS['24h'])
  })

  it('does not find Object.prototype behind a stored period id', () => {
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(isPeriod(key), key).toBe(false)
      expect(periodMs(key), key).toBe(PERIODS['24h'])
    }
  })
})

describe('chipPeriods', () => {
  it('offers the usual set until an author picks their own', () => {
    expect(chipPeriods(undefined, '24h', '24h')).toEqual(PERIOD_CHIPS)
  })

  it('honours an explicit list, shortest first', () => {
    expect(chipPeriods(['7d', '1h', '6h'], '1h', '1h')).toEqual(['1h', '6h', '7d'])
  })

  it('always keeps a way back to the default and to the range on screen', () => {
    expect(chipPeriods(['1h'], '7d', '12h')).toEqual(['1h', '12h', '7d'])
  })

  it('treats an empty list as a deliberate none', () => {
    expect(chipPeriods([], '24h', '24h')).toEqual([])
  })

  it('offers nothing when every named range is one we do not have', () => {
    expect(chipPeriods(['constructor', 'whenever'], '24h', '24h')).toEqual([])
  })

  it('drops the ranges it cannot offer and keeps the rest', () => {
    expect(chipPeriods(['1h', 'toString', '7d'], '7d', '7d')).toEqual(['1h', '7d'])
  })

  it('survives a stored value that is not a list', () => {
    for (const bad of [{}, 'all', 42, true]) {
      expect(() => chipPeriods(bad, '24h', '24h'), String(bad)).not.toThrow()
      expect(chipPeriods(bad, '24h', '24h')).toEqual(PERIOD_CHIPS)
    }
  })

  it('never repeats a chip', () => {
    const out = chipPeriods(['1h', '1h', '24h'], '24h', '1h')
    expect(out).toEqual([...new Set(out)])
  })
})

describe('decimate', () => {
  it('leaves a series shorter than the cap alone', () => {
    const xs = [1, 2, 3]
    const ys = [10, 20, 30]
    expect(decimate(xs, ys, 100)).toEqual([xs, ys])
    expect(decimate(xs, ys, 0)).toEqual([xs, ys])
  })

  it('averages by time held rather than emitting the extremes', () => {
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const ys = [0, 100, 0, 0, 0, 0, 0, 0, 0, 0]
    const [, out] = decimate(xs, ys, 2)
    expect(out[0]!).toBeLessThan(50)
  })
})
