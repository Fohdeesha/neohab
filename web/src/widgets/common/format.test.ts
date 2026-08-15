import { describe, expect, it } from 'vitest'
import type { ItemState } from '../../api/types'
import { displayValue, ghostFor, isOn, isSegmentable, numericValue, segParts, splitValueUnit } from './format'

const state = (over: Partial<ItemState>): ItemState => ({ state: '0', type: 'Number', ...over })

describe('displayValue', () => {
  it('prefers the server-formatted value', () => {
    expect(displayValue(state({ state: '11.5', displayState: '11.5 °F' }))).toBe('11.5 °F')
    expect(displayValue(state({ state: '11.5' }))).toBe('11.5')
    expect(displayValue(undefined)).toBe('-')
  })
})

describe('splitValueUnit', () => {
  it('splits a number from a short unit so the two can be typeset apart', () => {
    expect(splitValueUnit('11.5 °F')).toEqual({ num: '11.5', unit: '°F' })
    expect(splitValueUnit('64%')).toEqual({ num: '64', unit: '%' })
    expect(splitValueUnit('1,024 kWh')).toEqual({ num: '1,024', unit: 'kWh' })
    expect(splitValueUnit('-3 °C')).toEqual({ num: '-3', unit: '°C' })
  })

  it('leaves anything that is not a reading alone', () => {
    for (const text of ['ON', 'Partly cloudy', '2026-08-04T10:00:00', '120,10,4', '-']) {
      expect(splitValueUnit(text), text).toEqual({ num: text })
    }
  })
})

describe('segment-display metadata', () => {
  it('splits a lone tenths digit, keeping the separator on the baseline', () => {
    expect(segParts('71.8')).toEqual({ int: '71.', frac: '8' })
    expect(segParts('-4,5')).toEqual({ int: '-4,', frac: '5' })
  })

  it('leaves every other shape whole', () => {
    for (const text of ['29.68', '100', 'OFF', '12:30']) {
      expect(segParts(text), text).toEqual({ int: text })
    }
  })

  it('always concatenates back to the input', () => {
    for (const text of ['71.8', '29.68', '100', 'OFF', '-0.1', '12:30']) {
      const { int, frac } = segParts(text)
      expect(int + (frac ?? ''), text).toBe(text)
    }
  })

  it('ghosts every digit as an 8, and nothing without digits', () => {
    expect(ghostFor('71.8')).toBe('88.8')
    expect(ghostFor('12:30')).toBe('88:88')
    expect(ghostFor('OFF')).toBeUndefined()
  })

  it('knows a plain reading from text', () => {
    expect(isSegmentable('71.8')).toBe(true)
    expect(isSegmentable('12:30')).toBe(true)
    expect(isSegmentable('-40')).toBe(true)
    expect(isSegmentable('OFF')).toBe(false)
    expect(isSegmentable('...')).toBe(false)
  })
})

describe('numericValue', () => {
  it('prefers the server-parsed number and falls back to parsing', () => {
    expect(numericValue(state({ state: '11.5 °F', numericState: 11.5 }))).toBe(11.5)
    expect(numericValue(state({ state: '42' }))).toBe(42)
    expect(numericValue(state({ state: 'ON' }))).toBeUndefined()
    expect(numericValue(undefined)).toBeUndefined()
  })
})

describe('isOn', () => {
  it('reads switches, dimmers and colours', () => {
    expect(isOn(state({ state: 'ON' }))).toBe(true)
    expect(isOn(state({ state: 'OFF' }))).toBe(false)
    expect(isOn(state({ state: '64' }))).toBe(true)
    expect(isOn(state({ state: '0' }))).toBe(false)
    // an HSB triple is on when its brightness is
    expect(isOn(state({ state: '120,100,50' }))).toBe(true)
    expect(isOn(state({ state: '120,100,0' }))).toBe(false)
    expect(isOn(undefined)).toBe(false)
  })
})
