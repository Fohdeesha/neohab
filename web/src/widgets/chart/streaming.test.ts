import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryPoint } from '../../api/persistence'
import { AGGREGATE_FUNCTIONS, aggregateSeries, heatmapMatrix, type GroupBy } from './aggregate'
import { LINE_ROWS_KEPT, decimate, lineReducer } from './model'

// what the server would answer, and the sizes of the parts it arrives in
let history: HistoryPoint[] = []
let partSizes: number[] = [Infinity]
const asked: { item: string; boundary: boolean | undefined }[] = []

vi.mock('../../api/persistence', () => ({
  readItemHistory: async (item: string, _start: Date, opts: { boundary?: boolean }, take: (rows: HistoryPoint[]) => void) => {
    asked.push({ item, boundary: opts.boundary })
    let at = 0
    for (let i = 0; at < history.length; i++) {
      const size = partSizes[i % partSizes.length]
      take(history.slice(at, at + size))
      at += size
      await Promise.resolve()
    }
  }
}))

const { aggregationRows, loadChartData, loadHeatmapData, parseState } = await import('./data')

// a small seeded generator, so a failure names a case that can be run again
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const T0 = new Date(2026, 2, 1).getTime()
const HOUR = 3600e3

// rows the way the REST endpoint sends them: a row carried in at the window start, uneven gaps, now and then
// two rows at one instant, a state that is not a number, and a row past the window's end
function serverRows(rand: () => number, count: number, from: number, to: number, kind: 'number' | 'switch'): HistoryPoint[] {
  const rows: HistoryPoint[] = []
  if (rand() < 0.7) rows.push({ time: from, state: kind === 'switch' ? 'OFF' : '19.5' })
  let t = from
  const step = (to - from) / count
  for (let i = 0; i < count; i++) {
    t += Math.max(1, Math.round(step * (0.2 + rand() * 1.6)))
    if (t > to) break
    const state = kind === 'switch' ? (rand() < 0.5 ? 'ON' : 'OFF') : rand() < 0.02 ? 'UNDEF' : (18 + rand() * 6).toFixed(2)
    if (kind === 'switch' && rows.length > 0 && rows[rows.length - 1].state !== state)
      rows.push({ time: t, state: rows[rows.length - 1].state })
    else if (rand() < 0.03) rows.push({ time: t, state })
    rows.push({ time: t, state })
  }
  if (rand() < 0.5) rows.push({ time: to, state: kind === 'switch' ? 'ON' : '21.0' })
  return rows
}

// aggregationRows as it was written before it took its rows a part at a time: the yardstick
function rowsAsBefore(points: HistoryPoint[], from: number, to: number, boundary: boolean) {
  const xs: number[] = []
  const ys: (number | null)[] = []
  let leadingBoundary = false
  for (let i = 0; i < points.length; i++) {
    const t = points[i].time / 1000
    if (t >= to) continue
    if (i + 1 < points.length && points[i + 1].time === points[i].time) continue
    if (xs.length === 0 && boundary && t <= from) leadingBoundary = true
    xs.push(Math.max(t, from))
    ys.push(parseState(points[i].state))
  }
  return { xs, ys, leadingBoundary }
}

const GROUPS: GroupBy[] = ['hour', 'day', 'week', 'month', 'hourOfDay', 'dayOfWeek', 'monthOfYear']
const SPLITS = [[Infinity], [1], [2, 3], [7], [50, 1, 1], [1000]]

beforeEach(() => {
  history = []
  partSizes = [Infinity]
  asked.length = 0
  vi.useFakeTimers({ now: T0 + 400 * 24 * HOUR })
  return () => vi.useRealTimers()
})

describe('rows for aggregation, a part at a time', () => {
  it('keeps exactly the rows the batch form kept, for numbers and switches', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = seeded(seed)
      const from = T0 + Math.floor(rand() * 48) * HOUR
      const to = from + (1 + Math.floor(rand() * 200)) * HOUR
      const points = serverRows(rand, 5 + Math.floor(rand() * 300), from, to, seed % 2 ? 'number' : 'switch')
      for (const boundary of [true, false]) {
        expect(aggregationRows(points, from / 1000, to / 1000, boundary), `seed ${seed} boundary ${boundary}`).toEqual(
          rowsAsBefore(points, from / 1000, to / 1000, boundary)
        )
      }
    }
  })
})

describe('a chart loaded in parts', () => {
  it('groups to the same buckets however the history is cut up', async () => {
    let compared = 0
    for (let seed = 1; seed <= 24; seed++) {
      const rand = seeded(1000 + seed)
      const from = T0 + Math.floor(rand() * 72) * HOUR
      const to = from + (24 + Math.floor(rand() * 24 * 60)) * HOUR
      history = serverRows(rand, 40 + Math.floor(rand() * 500), from, to, seed % 3 === 0 ? 'switch' : 'number')
      const rows = rowsAsBefore(history, from / 1000, to / 1000, true)
      const groupBy = GROUPS[seed % GROUPS.length]
      for (const fn of AGGREGATE_FUNCTIONS) {
        const want = aggregateSeries(rows.xs, rows.ys, to / 1000, groupBy, fn, rows.leadingBoundary)
        for (const split of SPLITS) {
          partSizes = split
          const [got] = await loadChartData({ items: ['x'], aggregates: [fn], from: from / 1000, to: to / 1000, groupBy })
          expect(got, `seed ${seed} ${groupBy} ${fn} parts of ${split.join(',')}`).toEqual(want)
          compared++
        }
      }
    }
    expect(compared).toBe(24 * AGGREGATE_FUNCTIONS.length * SPLITS.length)
    expect(asked.every((a) => a.boundary === true)).toBe(true)
  })

  it('fills the same heatmap however the history is cut up', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = seeded(2000 + seed)
      const from = T0 + Math.floor(rand() * 72) * HOUR
      const to = from + 24 * (7 + Math.floor(rand() * 30)) * HOUR
      history = serverRows(rand, 200 + Math.floor(rand() * 800), from, to, 'number')
      const rows = rowsAsBefore(history, from / 1000, to / 1000, true)
      for (const fn of AGGREGATE_FUNCTIONS) {
        const want = heatmapMatrix(rows.xs, rows.ys, to / 1000, fn, rows.leadingBoundary)
        for (const split of SPLITS) {
          partSizes = split
          const got = await loadHeatmapData({ item: 'x', aggregate: fn, from: from / 1000, to: to / 1000 })
          expect(got, `seed ${seed} ${fn} parts of ${split.join(',')}`).toEqual(want)
        }
      }
    }
    expect(asked.length).toBeGreaterThan(0)
    expect(asked.every((a) => a.boundary === true)).toBe(true)
  })

  it('puts the time a value held in the weekday and hour it held it', async () => {
    // Tuesday 3 March 2026: 10 from 10:00, 20 from 10:15. Wednesday: 100 from 10:00 to the end at 11:00
    const tue = new Date(2026, 2, 3, 10).getTime()
    const wed = new Date(2026, 2, 4, 10).getTime()
    history = [
      { time: tue, state: '10' },
      { time: tue + 15 * 60e3, state: '20' },
      { time: tue + 60 * 60e3, state: 'UNDEF' },
      { time: wed, state: '100' }
    ]
    const map = await loadHeatmapData({ item: 'x', aggregate: 'average', from: tue / 1000, to: (wed + HOUR) / 1000 })
    // a quarter of the hour at 10 and the rest at 20, not the 15 the two rows average to
    expect(map.cells[1][10]).toBeCloseTo(17.5, 6)
    expect(map.cells[2][10]).toBeCloseTo(100, 6)
    expect(map.cells[0].every((c) => c === null)).toBe(true)
    expect(map.cells[1][11]).toBeNull()
  })

  it('draws an ungrouped series exactly as before, whole or in parts', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = seeded(3000 + seed)
      const from = T0
      const to = from + 24 * 30 * HOUR
      history = serverRows(rand, 50 + Math.floor(rand() * 3000), from, to, seed % 4 === 0 ? 'switch' : 'number')
      const xs = history.map((p) => Math.max(p.time / 1000, from / 1000))
      const ys = history.map((p) => parseState(p.state))
      for (const maxPoints of [250, 40, 0, 100000]) {
        const want = decimate(xs, ys, maxPoints)
        for (const split of SPLITS) {
          partSizes = split
          const [got] = await loadChartData({
            items: ['x'],
            aggregates: [undefined],
            from: from / 1000,
            to: to / 1000,
            groupBy: 'none',
            maxPoints
          })
          expect(got, `seed ${seed} maxPoints ${maxPoints} parts of ${split.join(',')}`).toEqual(want)
        }
      }
    }
    expect(asked.every((a) => a.boundary === false)).toBe(true)
  })

  it('loads every series of a chart, each from its own item', async () => {
    history = serverRows(seeded(7), 100, T0, T0 + 48 * HOUR, 'number')
    const tables = await loadChartData({
      items: ['a', 'b', 'c'],
      aggregates: [],
      from: T0 / 1000,
      to: (T0 + 48 * HOUR) / 1000,
      groupBy: 'none'
    })
    expect(tables.length).toBe(3)
    expect(asked.map((a) => a.item)).toEqual(['a', 'b', 'c'])
    expect(tables[0]).toEqual(tables[2])
  })

  it('groups each series by its own aggregate', async () => {
    const from = T0
    const to = T0 + 72 * HOUR
    history = serverRows(seeded(8), 300, from, to, 'number')
    const rows = rowsAsBefore(history, from / 1000, to / 1000, true)
    const [lows, highs] = await loadChartData({
      items: ['a', 'b'],
      aggregates: ['min', 'max'],
      from: from / 1000,
      to: to / 1000,
      groupBy: 'day'
    })
    expect(lows).toEqual(aggregateSeries(rows.xs, rows.ys, to / 1000, 'day', 'min', rows.leadingBoundary))
    expect(highs).toEqual(aggregateSeries(rows.xs, rows.ys, to / 1000, 'day', 'max', rows.leadingBoundary))
    expect(lows).not.toEqual(highs)
  })
})

describe('a line too long to keep', () => {
  // a slow wave with a faster ripple on it, a reading every 5 to 15 seconds
  function busy(count: number, rand: () => number): [number[], number[]] {
    const xs: number[] = []
    const ys: number[] = []
    let t = T0 / 1000
    for (let i = 0; i < count; i++) {
      t += 5 + Math.floor(rand() * 11)
      xs.push(t)
      ys.push(20 + 4 * Math.sin(t / 86400) + 0.8 * Math.sin(t / 900) + (rand() - 0.5) * 0.4)
    }
    return [xs, ys]
  }

  it('is reduced exactly as decimate would while it is short enough to keep whole', () => {
    const [xs, ys] = busy(LINE_ROWS_KEPT, seeded(11))
    const line = lineReducer(250)
    for (let i = 0; i < xs.length; i++) line.push(xs[i], ys[i])
    expect(line.finish()).toEqual(decimate(xs, ys, 250))
  })

  it('draws the same curve once it is too long for that, on the same buckets', () => {
    const [xs, ys] = busy(LINE_ROWS_KEPT + 150000, seeded(12))
    for (const maxPoints of [250, 1200]) {
      const line = lineReducer(maxPoints)
      for (let i = 0; i < xs.length; i++) line.push(xs[i], ys[i])
      const [gx, gy] = line.finish()
      const [wx, wy] = decimate(xs, ys, maxPoints)
      expect(gx.length).toBe(wx.length)
      let worstX = 0
      let worstY = 0
      for (let i = 0; i < wx.length; i++) {
        worstX = Math.max(worstX, Math.abs(gx[i] - wx[i]))
        worstY = Math.max(worstY, Math.abs((gy[i] as number) - (wy[i] as number)))
      }
      expect(worstX, `x off by ${worstX}s at ${maxPoints} points`).toBeLessThan(1e-3)
      // the signal ranges over about 10 and its ripple alone moves it by 1.6
      expect(worstY, `y off by ${worstY} at ${maxPoints} points`).toBeLessThan(0.05)
    }
  })

  it('weighs each value by how long it held, not by how many rows said it', () => {
    // every hour: a hundred readings of 30 within ten minutes, then one of 10 that holds for the other fifty
    const xs: number[] = []
    const ys: number[] = []
    let hour = T0 / 1000
    while (xs.length <= LINE_ROWS_KEPT + 40000) {
      for (let i = 0; i < 100; i++) {
        xs.push(hour + i * 6)
        ys.push(30)
      }
      xs.push(hour + 600)
      ys.push(10)
      hour += 3600
    }
    const line = lineReducer(250)
    for (let i = 0; i < xs.length; i++) line.push(xs[i], ys[i])
    const [gx, gy] = line.finish()
    const [wx, wy] = decimate(xs, ys, 250)
    expect(gx.length).toBe(wx.length)
    const mid = wy[Math.floor(wy.length / 2)] as number
    // a sixth of each hour at 30 and the rest at 10; the plain mean of the rows would be near 30
    expect(mid).toBeGreaterThan(13)
    expect(mid).toBeLessThan(13.7)
    // a swing of 20 inside every hour is the hardest case for a grid: still within half a percent of it
    expect(Math.max(...gy.map((v, i) => Math.abs((v as number) - (wy[i] as number))))).toBeLessThan(0.1)
  })

  it('shows a gap that one row with no value opened, however long nothing followed it', () => {
    const [xs, ys] = busy(LINE_ROWS_KEPT + 30000, seeded(17))
    const vals: (number | null)[] = ys.slice()
    const at = Math.floor(xs.length * 0.6)
    vals[at] = null
    // nothing at all for three days after it
    for (let i = at + 1; i < xs.length; i++) xs[i] += 3 * 86400
    const line = lineReducer(250)
    for (let i = 0; i < xs.length; i++) line.push(xs[i], vals[i])
    const [gx, gy] = line.finish()
    const [wx, wy] = decimate(xs, vals, 250)
    expect(wx.filter((x) => x > xs[at] + 3600 && x < xs[at + 1] - 3600).length).toBe(0)
    expect(gx.length).toBe(wx.length)
    expect(Math.max(...gx.map((x, i) => Math.abs(x - wx[i])))).toBeLessThan(1e-3)
    expect(Math.max(...gy.map((v, i) => Math.abs((v as number) - (wy[i] as number))))).toBeLessThan(0.05)
  })

  it('keeps its detail when a busy stretch is followed by a long quiet one', () => {
    const [xs, ys] = busy(LINE_ROWS_KEPT + 20000, seeded(16))
    // the item then reports once a day for most of a year
    let t = xs[xs.length - 1]
    for (let day = 0; day < 300; day++) {
      t += 86400
      xs.push(t)
      ys.push(20 + (day % 5))
    }
    const line = lineReducer(250)
    for (let i = 0; i < xs.length; i++) line.push(xs[i], ys[i])
    const [gx, gy] = line.finish()
    const [wx, wy] = decimate(xs, ys, 250)
    expect(gx.length).toBe(wx.length)
    expect(Math.max(...gx.map((x, i) => Math.abs(x - wx[i])))).toBeLessThan(1e-3)
    const worst = Math.max(...gy.map((v, i) => Math.abs((v as number) - (wy[i] as number))))
    expect(worst, `y off by ${worst}`).toBeLessThan(0.05)
  })

  it('still shows where there were no readings, to the row', () => {
    const [xs, ys] = busy(LINE_ROWS_KEPT + 60000, seeded(13))
    const vals: (number | null)[] = ys.slice()
    // a tenth of the range with no value, in the middle
    const a = Math.floor(xs.length * 0.45)
    const b = Math.floor(xs.length * 0.55)
    for (let i = a; i < b; i++) vals[i] = null
    for (const maxPoints of [250, 2000]) {
      const line = lineReducer(maxPoints)
      for (let i = 0; i < xs.length; i++) line.push(xs[i], vals[i])
      const [gx, gy] = line.finish()
      const [wx, wy] = decimate(xs, vals, maxPoints)
      expect(wx.filter((x) => x > xs[a] && x < xs[b]).length).toBeLessThan(wx.length / 50)
      // the same buckets drawn and the same ones left empty
      expect(gx.length).toBe(wx.length)
      expect(Math.max(...gx.map((x, i) => Math.abs(x - wx[i])))).toBeLessThan(1e-3)
      expect(Math.max(...gy.map((v, i) => Math.abs((v as number) - (wy[i] as number))))).toBeLessThan(0.05)
    }
  })

  it('marks a gap and the value after it at the rows they began on, not at the edge of a cell', () => {
    const [xs, ys] = busy(LINE_ROWS_KEPT + 30000, seeded(18))
    const vals: (number | null)[] = ys.slice()
    const a = Math.floor(xs.length * 0.5)
    const b = a + 4000
    for (let i = a; i < b; i++) vals[i] = null
    // with no reduction asked for, what comes back is the grid itself
    const grid = lineReducer(0)
    for (let i = 0; i < xs.length; i++) grid.push(xs[i], vals[i])
    const [gx, gy] = grid.finish()
    const firstNull = gy.findIndex((v) => v === null)
    expect(gx[firstNull]).toBe(xs[a])
    const resumed = gy.findIndex((v, i) => i > firstNull && v !== null)
    expect(gx[resumed]).toBe(xs[b])
    expect(gx[0]).toBe(xs[0])
    expect(gx[gx.length - 1]).toBe(xs[xs.length - 1])
    expect(gx.every((x, i) => i === 0 || x > gx[i - 1])).toBe(true)
  })

  it('keeps every row when nobody asked for fewer, until that is too many to draw', () => {
    const [xs, ys] = busy(5000, seeded(14))
    const all = lineReducer(0)
    for (let i = 0; i < xs.length; i++) all.push(xs[i], ys[i])
    expect(all.finish()).toEqual([xs, ys])
    const [lx, ly] = busy(LINE_ROWS_KEPT + 100000, seeded(15))
    const capped = lineReducer(0)
    for (let i = 0; i < lx.length; i++) capped.push(lx[i], ly[i])
    const [cx] = capped.finish()
    // the rows fill between half and all of the finest grid, a point for each cell, and the last row
    expect(cx.length).toBeGreaterThanOrEqual(100000)
    expect(cx.length).toBeLessThanOrEqual(200001)
  })

  it('stays whole when its rows span no time to make a grid from', () => {
    const line = lineReducer(250)
    for (let i = 0; i <= LINE_ROWS_KEPT + 5; i++) line.push(1000, 1)
    const [x, y] = line.finish()
    expect(x.length).toBe(LINE_ROWS_KEPT + 6)
    expect(y.every((v) => v === 1)).toBe(true)
  })
})
