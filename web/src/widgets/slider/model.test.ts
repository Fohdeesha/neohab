import { describe, expect, it } from 'vitest'
import { numericScale } from '../common/itemControl'
import {
  STYLE_FLOOR,
  VERTICAL_FLOOR,
  boundsOf,
  orientOf,
  readingOf,
  sliderFloor,
  styleOf,
  tintedOf,
} from './model'
import type { SliderStyle } from './model'

const STYLES: SliderStyle[] = ['plain', 'gradient', 'bubble', 'inset', 'taper']

describe('slider style and orientation', () => {
  it('reads every style it offers', () => {
    for (const s of STYLES) expect(styleOf(s)).toBe(s)
  })

  it('falls back to the gradient style, which is what a slider that never chose one draws', () => {
    expect(styleOf(undefined)).toBe('gradient')
    expect(styleOf('')).toBe('gradient')
    expect(styleOf('Gradient')).toBe('gradient')
    expect(styleOf('nonesuch')).toBe('gradient')
  })

  /**
   * A style out of a stored configuration is a key this code did not choose. Read with a bare
   * index, `constructor` finds a function on Object.prototype, which is not nullish, so a
   * trailing `?? 'gradient'` never fires and the widget renders `nh-fader--function Object()...`.
   */
  it('is not fooled by a key that exists on every object', () => {
    for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
      expect(styleOf(key), key).toBe('gradient')
      expect(orientOf(key), key).toBe('horizontal')
    }
  })

  it('ignores a stored value that is not a string at all', () => {
    for (const junk of [1, true, null, {}, [], () => 'plain']) {
      expect(styleOf(junk)).toBe('gradient')
      expect(orientOf(junk)).toBe('horizontal')
    }
  })

  it('reads both orientations, and starts horizontal', () => {
    expect(orientOf('horizontal')).toBe('horizontal')
    expect(orientOf('vertical')).toBe('vertical')
    expect(orientOf(undefined)).toBe('horizontal')
    expect(orientOf('sideways')).toBe('horizontal')
  })
})

describe('the tile accent', () => {
  /**
   * The same rule `widgetAccentColor` applies before writing `--nh-cellaccent` onto the cell: the
   * class this decides and the variable that class reads have to agree, or a tinted look would
   * mix toward a colour that is not there.
   */
  it('counts a colour the cell would actually carry', () => {
    expect(tintedOf('#ff0000')).toBe(true)
    expect(tintedOf('rebeccapurple')).toBe(true)
    expect(tintedOf('  #0b3d91  ')).toBe(true)
  })

  it('counts nothing else', () => {
    expect(tintedOf(undefined)).toBe(false)
    expect(tintedOf('')).toBe(false)
    expect(tintedOf('   ')).toBe(false)
    expect(tintedOf(0xff0000)).toBe(false)
    expect(tintedOf('x'.repeat(41))).toBe(false)
  })
})

describe('the floor a stacked phone row gets', () => {
  it('gives every style one, and asks for more of a vertical fader', () => {
    for (const s of STYLES) {
      expect(STYLE_FLOOR[s], s).toBeGreaterThan(0)
      expect(sliderFloor(s, 'horizontal'), s).toBe(STYLE_FLOOR[s])
      // A fader with no travel is not a control, whichever style draws it.
      expect(sliderFloor(s, 'vertical'), s).toBe(VERTICAL_FLOOR)
      expect(sliderFloor(s, 'vertical'), s).toBeGreaterThan(STYLE_FLOOR[s])
    }
  })

  it('asks for the most where the badge rides above the track', () => {
    // The bubble's reading is a badge over the thumb rather than a row beside it, so its rail
    // starts lower down and the row it sits in has to be taller.
    for (const s of STYLES) if (s !== 'bubble') expect(STYLE_FLOOR.bubble).toBeGreaterThan(STYLE_FLOOR[s])
  })
})

describe('the reading', () => {
  it('shows the digits the step resolves', () => {
    expect(readingOf(21.5, 1)).toBe('22')
    expect(readingOf(21.5, 0.5)).toBe('21.5')
    expect(readingOf(21.46, 0.01)).toBe('21.46')
    // Never snapped to the step itself: a 50 K step still reads the value it was given.
    expect(readingOf(4123, 50)).toBe('4123')
  })

  it('appends a unit only when one was stored', () => {
    expect(readingOf(60, 1, '%')).toBe('60%')
    expect(readingOf(60, 1, ' K')).toBe('60 K')
    expect(readingOf(60, 1)).toBe('60')
    expect(readingOf(60, 1, undefined)).toBe('60')
    // A unit out of an imported file need not be a string.
    expect(readingOf(60, 1, 5 as unknown as string)).toBe('60')
  })

  it('reads something rather than NaN when the value is not a number', () => {
    expect(readingOf(NaN, 1)).toBe('0')
    expect(readingOf(Infinity, 1)).toBe('0')
  })
})

describe('the ends of the scale', () => {
  it('prints them at the step precision, with no unit', () => {
    expect(boundsOf(numericScale(0, 100, 1))).toEqual(['0', '100'])
    expect(boundsOf(numericScale(16, 30, 0.5))).toEqual(['16.0', '30.0'])
    expect(boundsOf(numericScale(2000, 6500, 50))).toEqual(['2000', '6500'])
  })

  it('prints the guarded scale, not the stored one', () => {
    // A maximum at or below the minimum leaves nothing to drag along, so the scale reader
    // replaces it - and the labels have to say what the track actually spans.
    expect(boundsOf(numericScale(0, -5, 0))).toEqual(['0', '100'])
    expect(boundsOf(numericScale('abc', 'xyz', 'nope'))).toEqual(['0', '100'])
  })
})
