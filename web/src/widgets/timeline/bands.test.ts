import { describe, expect, it } from 'vitest'
import type { HistoryPoint } from '../../api/persistence'
import { bandBuilder, partitionHistory, thinBands, type TimelineBand } from './model'

const GAPS = new Set(['NULL', 'UNDEF', ''])

// partitionHistory as it was written before the bands were built a part at a time: the yardstick
function partitionAsBefore(points: HistoryPoint[], windowStart: number, now: number): TimelineBand[] {
  const bands: TimelineBand[] = []
  let state: string | null = null
  let start = 0
  for (const p of points) {
    if (p.time > now) break
    if (state === null) {
      state = p.state
      start = p.time
      continue
    }
    if (p.state !== state) {
      bands.push({ state, start, end: p.time })
      state = p.state
      start = p.time
    }
  }
  if (state !== null) bands.push({ state, start, end: now })
  return bands
    .filter((b) => b.end > windowStart && !GAPS.has(b.state))
    .map((b) => (b.start < windowStart ? { ...b, start: windowStart } : b))
}

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

const STATES = ['ON', 'OFF', 'ON', 'OFF', 'NULL', 'UNDEF', '', 'heat', 'cool']

// a history that starts before the window, repeats states, has gaps and bursts, and may run past "now"
function points(rand: () => number, count: number, windowStart: number, now: number): HistoryPoint[] {
  const out: HistoryPoint[] = []
  let t = windowStart - Math.floor(rand() * 3) * 3600e3
  for (let i = 0; i < count; i++) {
    t += rand() < 0.3 ? 1 + Math.floor(rand() * 2000) : Math.floor(rand() * ((now - windowStart) / count) * 2.5)
    out.push({ time: t, state: STATES[Math.floor(rand() * STATES.length)] })
  }
  return out
}

function inParts(all: HistoryPoint[], sizes: number[], windowStart: number, now: number, minDuration: number): TimelineBand[] {
  const bands = bandBuilder(windowStart, now, minDuration)
  let at = 0
  for (let i = 0; at < all.length; i++) {
    const size = sizes[i % sizes.length]
    bands.take(all.slice(at, at + size))
    at += size
  }
  return bands.finish()
}

describe('bands built a part at a time', () => {
  const now = Date.UTC(2026, 5, 1)

  it('are the bands the batch form gave, thinned the same way, however the history is cut up', () => {
    let compared = 0
    for (let seed = 1; seed <= 80; seed++) {
      const rand = seeded(seed)
      const windowMs = [3600e3, 24 * 3600e3, 30 * 24 * 3600e3][seed % 3]
      const windowStart = now - windowMs
      const all = points(rand, 1 + Math.floor(rand() * 400), windowStart, now)
      for (const minDuration of [0, windowMs / 1500, windowMs / 40]) {
        const want = thinBands(partitionAsBefore(all, windowStart, now), minDuration)
        for (const sizes of [[Infinity], [1], [3, 1], [17], [200]]) {
          expect(inParts(all, sizes, windowStart, now, minDuration), `seed ${seed} min ${minDuration} parts of ${sizes.join(',')}`).toEqual(
            want
          )
          compared++
        }
      }
    }
    expect(compared).toBe(80 * 3 * 5)
  })

  it('still partition a whole history the way they did', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = seeded(500 + seed)
      const windowStart = now - 24 * 3600e3
      const all = points(rand, 1 + Math.floor(rand() * 200), windowStart, now)
      expect(partitionHistory(all, windowStart, now), `seed ${seed}`).toEqual(partitionAsBefore(all, windowStart, now))
    }
  })

  it('hold a few hundred bands for a window of a hundred thousand changes', () => {
    const windowMs = 30 * 24 * 3600e3
    const windowStart = now - windowMs
    const all: HistoryPoint[] = []
    for (let i = 0; i < 100000; i++) all.push({ time: windowStart + i * 25000, state: String(i % 7) })
    const got = inParts(all, [20000], windowStart, now, windowMs / 1500)
    expect(got).toEqual(thinBands(partitionAsBefore(all, windowStart, now), windowMs / 1500))
    // changes 25 s apart are all shorter than the 29 minutes a band has to last in a 30-day window
    expect(got.length).toBe(2)
    const slower: HistoryPoint[] = []
    for (let i = 0; i < 100000; i++) slower.push({ time: windowStart + i * 25000, state: String(Math.floor(i / 90) % 7) })
    const kept = inParts(slower, [20000], windowStart, now, windowMs / 1500)
    expect(kept).toEqual(thinBands(partitionAsBefore(slower, windowStart, now), windowMs / 1500))
    expect(kept.length).toBeGreaterThan(1000)
    expect(kept.length).toBeLessThanOrEqual(1502)
  })

  it('give nothing for no points, and one band for a state that never changed', () => {
    expect(inParts([], [5], now - 3600e3, now, 100)).toEqual([])
    const steady = [
      { time: now - 7200e3, state: 'ON' },
      { time: now - 100, state: 'ON' }
    ]
    expect(inParts(steady, [1], now - 3600e3, now, 100)).toEqual([{ state: 'ON', start: now - 3600e3, end: now }])
  })

  it('stop at the first point past now, as before', () => {
    const all = [
      { time: now - 3000, state: 'ON' },
      { time: now - 2000, state: 'OFF' },
      { time: now + 5, state: 'ON' },
      { time: now - 1000, state: 'heat' }
    ]
    expect(inParts(all, [1], now - 3600e3, now, 0)).toEqual(partitionAsBefore(all, now - 3600e3, now))
  })
})
