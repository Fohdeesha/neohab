import { describe, expect, it } from 'vitest'
import { contrastLevel, contrastOf, contrastRatio, DARK_INK, parseColor, readableInk, relativeLuminance } from './contrast'

describe('parseColor', () => {
  it('reads the forms a person can type', () => {
    expect(parseColor('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseColor('#000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(parseColor('#F80')).toEqual({ r: 255, g: 136, b: 0 })
    expect(parseColor('rgb(18, 52, 86)')).toEqual({ r: 18, g: 52, b: 86 })
    expect(parseColor('rgba(18 52 86 / 0.5)')).toEqual({ r: 18, g: 52, b: 86 })
    expect(parseColor('#11223344')).toEqual({ r: 17, g: 34, b: 51 })
  })

  it('refuses what it cannot read, rather than guessing', () => {
    for (const input of [
      'rebeccapurple',
      'color-mix(in srgb, red 50%, blue)',
      'var(--nh-primary)',
      'linear-gradient(red, blue)',
      '#12345',
      '',
      undefined
    ]) {
      expect(parseColor(input), String(input)).toBeNull()
    }
  })
})

describe('contrast', () => {
  it('matches the WCAG reference points', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5)
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5)
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 4)
    expect(contrastRatio({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 4)
    expect(contrastRatio({ r: 10, g: 10, b: 10 }, { r: 10, g: 10, b: 10 })).toBeCloseTo(1, 5)
  })

  it('reports the bar a ratio clears', () => {
    expect(contrastLevel(21)).toBe('AAA')
    expect(contrastLevel(7)).toBe('AAA')
    expect(contrastLevel(4.5)).toBe('AA')
    expect(contrastLevel(3)).toBe('AA-large')
    expect(contrastLevel(2.9)).toBe('fail')
  })

  it('says "cannot judge" rather than inventing a number', () => {
    expect(contrastOf('#fff', 'color-mix(in srgb, red 50%, blue)')).toBeNull()
    expect(contrastOf(undefined, '#000')).toBeNull()
    expect(contrastOf('#ffffff', '#000000')).toBeCloseTo(21, 4)
  })

  it('measures a translucent colour as what it looks like over what is under it', () => {
    // white text at 50% on black reads as mid grey, nowhere near 21:1
    const half = contrastOf('rgba(255, 255, 255, 0.5)', '#000000')!
    expect(half).toBeCloseTo(contrastOf('#808080', '#000000')!, 1)
    expect(contrastOf('#ffffff80', '#000000')).toBeCloseTo(half, 1)
    // a glass surface over the page is measured as the blend of the two
    expect(contrastOf('#000000', 'rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(contrastOf('#000000', '#808080')!, 1)
  })

  it('has no answer for a translucent background with nothing opaque under it', () => {
    expect(contrastOf('#ffffff', 'rgba(0, 0, 0, 0.5)')).toBeNull()
    expect(contrastOf('#ffffff', 'rgba(0, 0, 0, 0.5)', 'rgba(0, 0, 0, 0.2)')).toBeNull()
  })
})

describe('readableInk', () => {
  it('picks white on dark accents and dark ink on light ones', () => {
    expect(readableInk('#0b78c2')).toBe('#ffffff') // the light theme's blue
    expect(readableInk('#1d242c')).toBe('#ffffff')
    expect(readableInk('#ffd23c')).toBe(DARK_INK) // amber - white here is the bug
    expect(readableInk('#40d364')).toBe(DARK_INK) // Assembly's vivid green
    expect(readableInk('#ffffff')).toBe(DARK_INK)
    expect(readableInk('#000000')).toBe('#ffffff')
  })

  it('always chooses the higher-contrast of the two', () => {
    for (const c of ['#38b6ff', '#e2382a', '#f2681f', '#3fd2f6', '#a3ce4a', '#7f7f7f', '#808080']) {
      const ink = readableInk(c)!
      const other = ink === '#ffffff' ? DARK_INK : '#ffffff'
      expect(contrastOf(ink, c)!, `${c} -> ${ink}`).toBeGreaterThanOrEqual(contrastOf(other, c)!)
    }
  })

  it('returns null for a colour it cannot read, so the caller keeps what it had', () => {
    expect(readableInk('var(--nh-primary)')).toBeNull()
    expect(readableInk(undefined)).toBeNull()
  })
})
