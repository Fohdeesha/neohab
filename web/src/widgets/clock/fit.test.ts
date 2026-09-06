import { describe, expect, it } from 'vitest'
import { CLOCK_LINES, EM_PER_CHAR, MIN_PX, WIDTH_BUDGET, chromeFor, fit, lineFit, shareOf } from './fit'
import type { ClockLine } from './fit'

function resolve(css: string, em: number, w: number, h: number): number {
  const m = /^min\((\d*\.?\d+)em, max\((\d+)px, calc\(\(100cqh - (\d+)px\) \* (\d*\.?\d+)\)\), (\d*\.?\d+)cqw\)$/.exec(css)
  if (!m) throw new Error('unparseable cap: ' + css)
  const [, emSize, floor, chrome, share, cqw] = m
  return Math.min(Number(emSize) * em, Math.max(Number(floor), (h - Number(chrome)) * Number(share)), (Number(cqw) / 100) * w)
}

describe('clock size cap', () => {
  it('leaves a roomy cell exactly at its em size', () => {
    const css = fit(2, '08:25 AM', 18, 0.586)
    expect(resolve(css, 16, 520, 520)).toBeCloseTo(32, 5)
  })

  it('shrinks the reading to the width a short wide cell has', () => {
    const css = fit(2, '08:25:54 AM', 18, 0.586)
    const px = resolve(css, 17.28, 153, 75)
    expect(px).toBeLessThan(2 * 17.28)
    expect(px * EM_PER_CHAR * '08:25:54 AM'.length).toBeLessThanOrEqual((WIDTH_BUDGET / 100) * 153 + 0.01)
  })

  it('gives a short string more room than a long one in the same cell', () => {
    const short = resolve(fit(2, '08:25', 18, 0.586), 17.28, 153, 75)
    const long = resolve(fit(2, '08:25:54 AM', 18, 0.586), 17.28, 153, 75)
    expect(short).toBeGreaterThan(long)
  })

  it('leaves room for the date under the time', () => {
    const h = 113
    const time = resolve(fit(2, '08:25:54 AM', 18, 0.586), 17.6, 516, h)
    const date = resolve(fit(0.9, 'Sunday, August 23, 2026', 18, 0.264), 17.6, 516, h)
    expect(time * 1.1 + 4 + date * 1.35).toBeLessThanOrEqual(h - 14)
  })

  it('still fits when the time has the tile to itself', () => {
    const h = 75
    const time = resolve(fit(2, '08:25:54 AM', 14, 0.909), 17.28, 153, h)
    expect(time * 1.1).toBeLessThanOrEqual(h - 14)
  })

  it('never asks for a negative size, however small the cell', () => {
    for (const h of [0, 5, 14, 18, 30]) {
      expect(resolve(fit(2, '08:25:54 AM', 18, 0.586), 16, 100, h)).toBeGreaterThanOrEqual(MIN_PX - 0.001)
    }
  })

  it('treats an empty string as one character rather than dividing by zero', () => {
    expect(resolve(fit(2, '', 18, 0.586), 16, 200, 200)).toBeGreaterThan(0)
  })
})

describe('line shares', () => {
  it('reproduces the caps the widget used to carry as constants', () => {
    expect(shareOf('time', ['time'])).toBe(0.909)
    expect(shareOf('dateOnly', ['dateOnly'])).toBe(0.74)
    expect(chromeFor(['time'])).toBe(14)
    expect(chromeFor(['time', 'date'])).toBe(18)
  })

  it('never hands back more room than those constants did', () => {
    expect(shareOf('time', ['time', 'date'])).toBeLessThanOrEqual(0.586)
    expect(shareOf('time', ['time', 'date'])).toBeGreaterThan(0.58)
    expect(shareOf('date', ['time', 'date'])).toBeLessThanOrEqual(0.264)
    expect(shareOf('date', ['time', 'date'])).toBeGreaterThan(0.26)
  })

  it('gives a third line room by taking it from the other two', () => {
    const two = shareOf('time', ['time', 'date'])
    const three = shareOf('time', ['time', 'zone', 'date'])
    expect(three).toBeLessThan(two)
    expect(chromeFor(['time', 'zone', 'date'])).toBe(22)
  })

  it('leaves every line inside the tile, in each combination it can draw', () => {
    const combinations: (readonly ClockLine[])[] = [
      ['time'],
      ['time', 'date'],
      ['time', 'zone'],
      ['time', 'zone', 'date'],
      ['dateOnly'],
      ['zone', 'dateOnly']
    ]
    for (const present of combinations) {
      const h = 200
      const used = present.reduce((sum, line) => {
        const px = (h - chromeFor(present)) * shareOf(line, present)
        return sum + px * CLOCK_LINES[line].lh
      }, 0)
      expect(used + chromeFor(present), present.join('+')).toBeLessThanOrEqual(h)
    }
  })

  it('keeps the lines in proportion to the sizes they asked for', () => {
    const present: ClockLine[] = ['time', 'zone', 'date']
    expect(shareOf('date', present) / shareOf('time', present)).toBeCloseTo(0.45, 2)
    expect(shareOf('zone', present) / shareOf('time', present)).toBeCloseTo(0.35, 2)
  })

  it('builds the same cap string the widget would have built by hand', () => {
    expect(lineFit('time', ['time', 'date'], '08:25')).toBe(fit(2, '08:25', 18, shareOf('time', ['time', 'date'])))
  })
})
