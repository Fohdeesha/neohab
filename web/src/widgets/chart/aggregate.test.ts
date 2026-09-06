import { describe, expect, it } from 'vitest'
import { aggregateSeries, calendarLabel, calendarWindow, categoryLabels, heatmapMatrix, isCategorical, windowIsCurrent } from './aggregate'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime() / 1000

describe('grouping', () => {
  it('leaves an ungrouped series exactly as it was', () => {
    const xs = [1, 2, 3]
    const ys = [10, 20, 30]
    expect(aggregateSeries(xs, ys, 4, 'none', 'average')).toEqual([xs, ys])
  })

  it('averages by time held, not by how many rows were stored', () => {
    const xs = [at(2026, 1, 1, 10, 0), at(2026, 1, 1, 10, 1)]
    const ys = [10, 0]
    const [, out] = aggregateSeries(xs, ys, at(2026, 1, 1, 11, 0), 'hour', 'average')
    expect(out[0]!).toBeCloseTo(10 / 60, 5)
  })

  it('reports the value in force in a bucket with no row of its own', () => {
    const [keys, out] = aggregateSeries([at(2026, 1, 1, 10, 0)], [7], at(2026, 1, 1, 13, 0), 'hour', 'average')
    expect(keys).toHaveLength(3)
    expect(out).toEqual([7, 7, 7])
  })

  it('gives min, max, first and last their obvious meanings', () => {
    const xs = [at(2026, 1, 1, 10, 0), at(2026, 1, 1, 10, 20), at(2026, 1, 1, 10, 40)]
    const ys = [5, 15, 10]
    const end = at(2026, 1, 1, 11, 0)
    expect(aggregateSeries(xs, ys, end, 'hour', 'min')[1]).toEqual([5])
    expect(aggregateSeries(xs, ys, end, 'hour', 'max')[1]).toEqual([15])
    expect(aggregateSeries(xs, ys, end, 'hour', 'first')[1]).toEqual([5])
    expect(aggregateSeries(xs, ys, end, 'hour', 'last')[1]).toEqual([10])
  })

  it('counts and sums the stored rows, not the time', () => {
    const xs = [at(2026, 1, 1, 10, 0), at(2026, 1, 1, 10, 20), at(2026, 1, 1, 10, 40)]
    const ys = [5, 15, 10]
    const end = at(2026, 1, 1, 11, 0)
    expect(aggregateSeries(xs, ys, end, 'hour', 'count')[1]).toEqual([3])
    expect(aggregateSeries(xs, ys, end, 'hour', 'sum')[1]).toEqual([30])
  })

  it('leaves a bucket with no stored row empty for the sample functions', () => {
    const [, counts] = aggregateSeries([at(2026, 1, 1, 10, 0)], [7], at(2026, 1, 1, 13, 0), 'hour', 'count')
    expect(counts).toEqual([1])
  })

  it('folds categorical buckets together across days', () => {
    const xs = [at(2026, 1, 1, 9, 0), at(2026, 1, 2, 9, 0)]
    const [keys] = aggregateSeries(xs, [1, 3], at(2026, 1, 2, 10, 0), 'hourOfDay', 'average')
    expect(keys).toContain(9)
    expect(isCategorical('hourOfDay')).toBe(true)
    expect(isCategorical('hour')).toBe(false)
  })

  it('skips nulls rather than treating them as zero', () => {
    const xs = [at(2026, 1, 1, 10, 0), at(2026, 1, 1, 10, 30)]
    const [, out] = aggregateSeries(xs, [null, 10], at(2026, 1, 1, 11, 0), 'hour', 'average')
    expect(out[0]).toBe(10)
  })
})

describe('the heatmap', () => {
  it('is a 7 by 24 matrix in local time', () => {
    const m = heatmapMatrix([at(2026, 1, 1, 9, 0)], [5], at(2026, 1, 1, 10, 0), 'average')
    expect(m.cells).toHaveLength(7)
    expect(m.cells[0]).toHaveLength(24)
    expect(m.cells[3][9]).toBe(5)
  })

  it('reports the range it found, and 0/0 when it found nothing', () => {
    const m = heatmapMatrix([at(2026, 1, 1, 9, 0), at(2026, 1, 1, 11, 0)], [2, 8], at(2026, 1, 1, 12, 0), 'average')
    expect(m.min).toBe(2)
    expect(m.max).toBe(8)
    const empty = heatmapMatrix([], [], 0, 'average')
    expect([empty.min, empty.max]).toEqual([0, 0])
    expect(empty.cells.flat().every((c) => c === null)).toBe(true)
  })

  it('counts stored rows per cell, the same thing count means on a grouped chart', () => {
    const xs = [at(2026, 1, 1, 9, 0), at(2026, 1, 1, 9, 20), at(2026, 1, 1, 9, 40)]
    const m = heatmapMatrix(xs, [1, 2, 3], at(2026, 1, 1, 10, 0), 'count')
    expect(m.cells[3][9]).toBe(3)
    const s = heatmapMatrix(xs, [1, 2, 3], at(2026, 1, 1, 10, 0), 'sum')
    expect(s.cells[3][9]).toBe(6)
  })
})

describe('calendar windows', () => {
  const now = new Date(2026, 7, 4, 15, 30).getTime() // Tue 4 Aug 2026

  it('aligns to the real calendar, so "last month" is a month', () => {
    const month = calendarWindow('month', -1, now)
    expect(new Date(month.from * 1000).getMonth()).toBe(6) // July
    expect(new Date(month.from * 1000).getDate()).toBe(1)
    expect(new Date(month.to * 1000).getMonth()).toBe(7) // exclusive end: 1 August
  })

  it('starts weeks on Monday', () => {
    const week = calendarWindow('week', 0, now)
    expect(new Date(week.from * 1000).getDay()).toBe(1)
    expect(week.to - week.from).toBe(7 * 86400)
  })

  it('knows which window contains the present', () => {
    expect(windowIsCurrent(calendarWindow('day', 0, now), now)).toBe(true)
    expect(windowIsCurrent(calendarWindow('day', -1, now), now)).toBe(false)
    expect(windowIsCurrent(calendarWindow('year', 0, now), now)).toBe(true)
  })

  it('labels a window in a way a person can read', () => {
    expect(calendarLabel('year', calendarWindow('year', 0, now), 'en-GB')).toBe('2026')
    expect(calendarLabel('month', calendarWindow('month', 0, now), 'en-GB')).toMatch(/August 2026/)
  })
})

describe('category labels', () => {
  it('numbers the hours and names the days and months in the locale', () => {
    expect(categoryLabels('hourOfDay')).toHaveLength(24)
    expect(categoryLabels('hourOfDay')[0]).toBe('0')
    const days = categoryLabels('dayOfWeek', 'en-GB')
    expect(days).toHaveLength(7)
    expect(days[0]).toMatch(/^Mon/)
    expect(categoryLabels('monthOfYear', 'en-GB')).toHaveLength(12)
    expect(categoryLabels('none')).toEqual([])
  })
})
