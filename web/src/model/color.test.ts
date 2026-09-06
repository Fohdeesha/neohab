import { describe, expect, it } from 'vitest'
import { hsbToCss, hsbToRgb, parseHsb, sameColor } from './color'

describe('parseHsb', () => {
  it('reads what an openHAB Color item sends', () => {
    expect(parseHsb('120,100,50')).toEqual({ h: 120, s: 100, b: 50 })
    expect(parseHsb('359.9,100,100')).toEqual({ h: 359.9, s: 100, b: 100 })
  })

  it('reads nothing out of nothing', () => {
    expect(parseHsb(undefined)).toEqual({ h: 0, s: 0, b: 0 })
    expect(parseHsb('')).toEqual({ h: 0, s: 0, b: 0 })
    expect(parseHsb('abc')).toEqual({ h: 0, s: 0, b: 0 })
  })
})

describe('hsbToRgb', () => {
  it('converts the six hue segments', () => {
    expect(hsbToRgb({ h: 0, s: 100, b: 100 })).toEqual([255, 0, 0])
    expect(hsbToRgb({ h: 120, s: 100, b: 100 })).toEqual([0, 255, 0])
    expect(hsbToRgb({ h: 240, s: 100, b: 100 })).toEqual([0, 0, 255])
    expect(hsbToRgb({ h: 0, s: 0, b: 0 })).toEqual([0, 0, 0])
    expect(hsbToRgb({ h: 0, s: 0, b: 100 })).toEqual([255, 255, 255])
  })

  it('wraps a hue outside 0-360 instead of throwing', () => {
    expect(() => hsbToRgb({ h: -10, s: 50, b: 50 })).not.toThrow()
    expect(hsbToRgb({ h: -120, s: 100, b: 100 })).toEqual([0, 0, 255])
    expect(hsbToRgb({ h: 480, s: 100, b: 100 })).toEqual([0, 255, 0])
    expect(hsbToRgb({ h: -720, s: 100, b: 100 })).toEqual([255, 0, 0])
  })

  it('treats a hue that is not a number as zero', () => {
    expect(hsbToRgb({ h: Infinity, s: 100, b: 100 })).toEqual([255, 0, 0])
    expect(hsbToRgb({ h: -Infinity, s: 100, b: 100 })).toEqual([255, 0, 0])
    expect(hsbToRgb({ h: NaN, s: 100, b: 100 })).toEqual([255, 0, 0])
  })

  it('keeps every channel inside 0-255 whatever it is handed', () => {
    for (const hsb of [
      { h: 0, s: 500, b: 500 },
      { h: 200, s: -100, b: -100 },
      { h: 200, s: NaN, b: NaN },
      { h: 200, s: Infinity, b: Infinity }
    ]) {
      const rgb = hsbToRgb(hsb)
      expect(rgb).toHaveLength(3)
      for (const v of rgb) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      }
    }
  })
})

describe('hsbToCss and sameColor', () => {
  it('renders a css colour', () => {
    expect(hsbToCss({ h: 0, s: 100, b: 100 })).toBe('rgb(255, 0, 0)')
  })

  it('never produces a css value the browser would drop', () => {
    for (const s of ['-10,50,50', '1e999,50,50', '400,50,50', 'abc', '', '0,0,0']) {
      expect(hsbToCss(parseHsb(s))).toMatch(/^rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)$/)
    }
  })

  it('compares a hostile stored command against a live state without throwing', () => {
    expect(() => sameColor(parseHsb('-10,50,50'), parseHsb('120,50,50'))).not.toThrow()
    expect(sameColor(parseHsb('-120,100,100'), parseHsb('240,100,100'))).toBe(true)
  })
})
