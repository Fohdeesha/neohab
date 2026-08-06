/**
 * What a chart configuration describes.
 *
 * These read stored configuration during render, which makes them the place a hostile or
 * half-written component turns into a thrown exception — and a widget throwing during render used
 * to unmount the whole app, not one tile.
 */
import { describe, expect, it } from 'vitest'
import { decimate, effectiveSeries, effectiveThresholds, type ChartConfig } from './model'

describe('effectiveSeries', () => {
  it('keeps the configured series', () => {
    expect(effectiveSeries({ series: [{ item: 'A' }, { item: 'B', label: 'Bee' }] })).toEqual([
      { item: 'A' },
      { item: 'B', label: 'Bee' },
    ])
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

describe('decimate', () => {
  it('leaves a series shorter than the cap alone', () => {
    const xs = [1, 2, 3]
    const ys = [10, 20, 30]
    expect(decimate(xs, ys, 100)).toEqual([xs, ys])
    expect(decimate(xs, ys, 0)).toEqual([xs, ys])
  })

  it('averages by time held rather than emitting the extremes', () => {
    // A value that held for almost the whole bucket decides it; min/max-per-bucket used to turn
    // noisy data into a full-amplitude sawtooth that looked nothing like the raw plot.
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const ys = [0, 100, 0, 0, 0, 0, 0, 0, 0, 0]
    const [, out] = decimate(xs, ys, 2)
    expect(out[0]!).toBeLessThan(50)
  })
})
