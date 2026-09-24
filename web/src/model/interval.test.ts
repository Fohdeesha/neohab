import { describe, expect, it } from 'vitest'
import { intervalMs, refreshMs } from './interval'

describe('refreshMs', () => {
  it('is off for anything that is not a positive number', () => {
    for (const off of [0, -1, '5s', '', null, undefined, NaN, {}]) expect(refreshMs(off), String(off)).toBeNull()
  })

  it('is bounded when it is on', () => {
    expect(refreshMs(10)).toBe(10_000)
    expect(refreshMs('10')).toBe(10_000)
    expect(refreshMs(0.01)).toBe(1000)
    expect(refreshMs(1e12)).toBe(86_400_000)
  })
})

describe('intervalMs', () => {
  const secs = { unit: 's' as const, min: 1, max: 86_400, fallback: 60 }

  it('takes a sane period as it is', () => {
    expect(intervalMs(5, secs)).toBe(5000)
    expect(intervalMs('30', secs)).toBe(30_000)
  })

  it('falls back when the period is not a number at all', () => {
    for (const bad of ['5s', '', ' ', null, undefined, {}, [], NaN, Infinity]) expect(intervalMs(bad, secs), String(bad)).toBe(60_000)
  })

  it('never goes under the floor, however small or negative', () => {
    expect(intervalMs(0.01, secs)).toBe(1000)
    expect(intervalMs(0, secs)).toBe(1000)
    expect(intervalMs(-5, secs)).toBe(1000)
  })

  it('never overflows the browser timer', () => {
    expect(intervalMs(1e12, secs)).toBe(86_400_000)
    expect(intervalMs(1e12, { unit: 'ms', min: 1, max: 1e15, fallback: 1 })).toBe(2_147_483_647)
  })
})
