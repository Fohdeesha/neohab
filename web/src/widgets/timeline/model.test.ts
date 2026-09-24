import { describe, expect, it } from 'vitest'
import {
  autoRefreshSeconds,
  axisTick,
  effectiveColorMaps,
  effectiveTimelineSeries,
  keepLiveTail,
  partitionHistory,
  thinBands,
  type TimelineConfig
} from './model'

describe('a refetch that lands after a live change', () => {
  const asked = 1000
  const fresh = [
    { state: 'OFF', start: 0, end: 500 },
    { state: 'ON', start: 500, end: 1000 }
  ]

  it('keeps the band the live update opened while the fetch was out', () => {
    const shown = [...fresh.slice(0, 1), { state: 'ON', start: 500, end: 1200 }, { state: 'OFF', start: 1200, end: 1200 }]
    expect(keepLiveTail(fresh, shown, asked)).toEqual([
      { state: 'OFF', start: 0, end: 500 },
      { state: 'ON', start: 500, end: 1200 },
      { state: 'OFF', start: 1200, end: 1200 }
    ])
  })

  it('takes the answer as it is when nothing changed meanwhile', () => {
    expect(keepLiveTail(fresh, [{ state: 'ON', start: 0, end: 900 }], asked)).toBe(fresh)
    expect(keepLiveTail(fresh, undefined, asked)).toBe(fresh)
  })

  it('does not draw the same change twice when the fetch caught it too', () => {
    const caught = [...fresh.slice(0, 1), { state: 'ON', start: 500, end: 1000 }, { state: 'OFF', start: 990, end: 1000 }]
    const shown = [...fresh, { state: 'OFF', start: 1005, end: 1010 }]
    expect(keepLiveTail(caught, shown, asked)).toEqual([...caught.slice(0, 2), { state: 'OFF', start: 990, end: 1010 }])
  })
})

describe('reading the configuration', () => {
  it('keeps the rows that name an item', () => {
    expect(effectiveTimelineSeries({ series: [{ item: 'A' }, { item: '' }, { item: 'B' }] })).toEqual([{ item: 'A' }, { item: 'B' }])
  })

  it('survives a series or colour map that is not a list', () => {
    for (const bad of [{}, 'A', 7, null] as unknown as TimelineConfig['series'][]) {
      expect(() => effectiveTimelineSeries({ series: bad }), String(bad)).not.toThrow()
      expect(effectiveTimelineSeries({ series: bad })).toEqual([])
    }
    for (const bad of [{}, 'red', 7] as unknown as TimelineConfig['colorMaps'][]) {
      expect(() => effectiveColorMaps({ colorMaps: bad }), String(bad)).not.toThrow()
      expect(effectiveColorMaps({ colorMaps: bad })).toEqual([])
    }
  })

  it('drops colour rows with no state or no colour', () => {
    expect(
      effectiveColorMaps({
        colorMaps: [{ state: 'ON', color: '#0f0' }, { state: '', color: '#f00' }, { state: 'OFF', color: '' }, null as never]
      })
    ).toEqual([{ state: 'ON', color: '#0f0' }])
  })
})

describe('partitionHistory', () => {
  const t0 = 1_000_000

  it('collapses a history into runs clipped to the window', () => {
    const bands = partitionHistory(
      [
        { time: t0 - 500, state: 'ON' },
        { time: t0 + 100, state: 'OFF' }
      ],
      t0,
      t0 + 200
    )
    expect(bands).toEqual([
      { state: 'ON', start: t0, end: t0 + 100 },
      { state: 'OFF', start: t0 + 100, end: t0 + 200 }
    ])
  })

  it('renders NULL and UNDEF as gaps rather than as a state', () => {
    const bands = partitionHistory(
      [
        { time: t0, state: 'NULL' },
        { time: t0 + 50, state: 'ON' }
      ],
      t0,
      t0 + 100
    )
    expect(bands).toEqual([{ state: 'ON', start: t0 + 50, end: t0 + 100 }])
  })
})

describe('thinBands', () => {
  it('absorbs runs too narrow to paint, and always keeps the current one', () => {
    const bands = [
      { state: 'A', start: 0, end: 100 },
      { state: 'B', start: 100, end: 101 },
      { state: 'C', start: 101, end: 102 }
    ]
    const out = thinBands(bands, 10)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ state: 'A', start: 0, end: 101 })
    expect(out[1].state).toBe('C')
  })
})

describe('autoRefreshSeconds', () => {
  it('stays between the floor and the ceiling for any window', () => {
    for (const ms of [3600e3, 24 * 3600e3, 365 * 86400e3]) {
      const s = autoRefreshSeconds(ms)
      expect(s).toBeGreaterThanOrEqual(30)
      expect(s).toBeLessThanOrEqual(900)
    }
  })
})

describe('thinBands and the band that is current', () => {
  it('keeps a short band while it is the last one', () => {
    const bands = [
      { state: 'a', start: 0, end: 100_000 },
      { state: 'b', start: 100_000, end: 100_500 }
    ]
    expect(thinBands(bands, 2400)).toHaveLength(2)
  })

  it('absorbs that same band once something is appended after it', () => {
    const bands = [
      { state: 'a', start: 0, end: 100_000 },
      { state: 'b', start: 100_000, end: 101_000 },
      { state: 'c', start: 101_000, end: 101_000 }
    ]
    expect(thinBands(bands, 2400)).toHaveLength(2)
  })
})

describe('axisTick', () => {
  const at = Date.UTC(2026, 8, 9, 14, 19)

  it('drops the minutes on a window whose ticks are hours apart', () => {
    expect(axisTick(at, 24 * 3600e3)).not.toContain(':')
  })

  it('keeps them while the ticks are minutes apart', () => {
    expect(axisTick(at, 3600e3)).toContain(':')
  })

  it('is a date once the window is longer than two days', () => {
    const long = axisTick(at, 7 * 24 * 3600e3)
    expect(long).not.toContain(':')
    expect(/\d/.test(long)).toBe(true)
  })

  it('is shorter than the clock a band range is written with', () => {
    expect(axisTick(at, 24 * 3600e3).length).toBeLessThan(axisTick(at, 3600e3).length)
  })
})
