import { describe, expect, it } from 'vitest'
import { aggregateSeries, heatmapMatrix } from './aggregate'
import { aggregationRows } from './data'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const row = (ms: number, state: string) => ({ time: ms, state })

describe('rows openHAB adds for drawing', () => {
  // a switch that went ON at 10:10 and OFF at 10:40, as the REST endpoint returns it with boundary=true:
  // the carried-in OFF at the window start, the previous state repeated at each change, and the end row
  const from = at(2026, 1, 1, 10) / 1000
  const to = at(2026, 1, 1, 11) / 1000
  const switchRows = [
    row(at(2026, 1, 1, 10), 'OFF'),
    row(at(2026, 1, 1, 10, 10), 'OFF'),
    row(at(2026, 1, 1, 10, 10), 'ON'),
    row(at(2026, 1, 1, 10, 40), 'ON'),
    row(at(2026, 1, 1, 10, 40), 'OFF'),
    row(at(2026, 1, 1, 11), 'OFF')
  ]

  it('drops the replicas and the end row, and marks the carried-in value', () => {
    const rows = aggregationRows(switchRows, from, to, true)
    expect(rows.ys).toEqual([0, 1, 0])
    expect(rows.leadingBoundary).toBe(true)
  })

  it('counts a switch that changed twice as two stored rows, not five', () => {
    const rows = aggregationRows(switchRows, from, to, true)
    expect(aggregateSeries(rows.xs, rows.ys, to, 'hour', 'count', rows.leadingBoundary)[1]).toEqual([2])
    expect(aggregateSeries(rows.xs, rows.ys, to, 'hour', 'sum', rows.leadingBoundary)[1]).toEqual([1])
  })

  it('still averages by the time each state held', () => {
    const rows = aggregationRows(switchRows, from, to, true)
    expect(aggregateSeries(rows.xs, rows.ys, to, 'hour', 'average', rows.leadingBoundary)[1][0]).toBeCloseTo(0.5, 5)
  })

  it('puts no bar in the bucket after a window in the past', () => {
    const dayFrom = at(2026, 1, 1) / 1000
    const dayTo = at(2026, 1, 2) / 1000
    const rows = aggregationRows([row(at(2026, 1, 1), '5'), row(at(2026, 1, 1, 12), '7'), row(at(2026, 1, 2), '7')], dayFrom, dayTo, true)
    const [keys] = aggregateSeries(rows.xs, rows.ys, dayTo, 'day', 'count', rows.leadingBoundary)
    expect(keys).toEqual([dayFrom])
  })

  it('keeps a real row that happens to be first when nothing was carried in', () => {
    const rows = aggregationRows([row(at(2026, 1, 1, 10, 5), '3')], from, to, true)
    expect(rows.leadingBoundary).toBe(false)
    expect(aggregateSeries(rows.xs, rows.ys, to, 'hour', 'count', rows.leadingBoundary)[1]).toEqual([1])
  })

  it('counts the same way on the heatmap', () => {
    const rows = aggregationRows(switchRows, from, to, true)
    const m = heatmapMatrix(rows.xs, rows.ys, to, 'count', rows.leadingBoundary)
    const d = new Date(from * 1000)
    expect(m.cells[(d.getDay() + 6) % 7][10]).toBe(2)
  })
})

describe('a window that reaches past now', () => {
  it('stops at the end it is given, and makes up no buckets after it', () => {
    const from = at(2026, 1, 1) / 1000
    const now = at(2026, 1, 1, 15, 30) / 1000
    const [keys] = aggregateSeries([from], [4], now, 'hour', 'average')
    expect(keys).toHaveLength(16)
    expect(Math.max(...keys)).toBe(at(2026, 1, 1, 15) / 1000)
  })
})
