import { describe, expect, it } from 'vitest'
import { commandOr, finiteOr, numericScale, rangeControl, stepDecimals } from './itemControl'

describe('numericScale', () => {
  it('passes a sane scale through untouched', () => {
    expect(numericScale(2000, 6500, 50)).toEqual({ min: 2000, max: 6500, step: 50 })
    expect(numericScale(-40, 120, 0.5)).toEqual({ min: -40, max: 120, step: 0.5 })
  })

  it('fills in the defaults for the keys nobody set', () => {
    expect(numericScale(undefined, undefined, undefined)).toEqual({ min: 0, max: 100, step: 1 })
  })

  it('reads numbers that were stored as text, which imports and hand edits produce', () => {
    expect(numericScale('10', '30', '2')).toEqual({ min: 10, max: 30, step: 2 })
  })

  /**
   * The values here decide a range input's own attributes and the dial's pointer arithmetic. A
   * step of zero makes the input inert and divides by zero in the snap; a maximum at or below the
   * minimum leaves no range to map a value onto.
   */
  it('refuses a scale a control could not work in', () => {
    expect(numericScale('abc', {}, null)).toEqual({ min: 0, max: 100, step: 1 })
    expect(numericScale(50, 10, 1)).toEqual({ min: 50, max: 150, step: 1 })
    expect(numericScale(0, 0, 1)).toEqual({ min: 0, max: 100, step: 1 })
    expect(numericScale(0, 100, 0)).toEqual({ min: 0, max: 100, step: 1 })
    expect(numericScale(0, 100, -5)).toEqual({ min: 0, max: 100, step: 1 })
    expect(numericScale(NaN, Infinity, NaN)).toEqual({ min: 0, max: 100, step: 1 })
  })
})

describe('finiteOr', () => {
  it('takes numbers and numeric text, and nothing else', () => {
    expect(finiteOr(7, 0)).toBe(7)
    expect(finiteOr('7.5', 0)).toBe(7.5)
    expect(finiteOr('', 3)).toBe(3)
    expect(finiteOr('x', 3)).toBe(3)
    expect(finiteOr(null, 3)).toBe(3)
    expect(finiteOr(undefined, 3)).toBe(3)
    expect(finiteOr([], 3)).toBe(3)
    expect(finiteOr(Infinity, 3)).toBe(3)
  })
})

describe('rangeControl', () => {
  it('carries the scale and a unit suffix', () => {
    expect(rangeControl(numericScale(2000, 6500, 50), 'K')).toEqual({
      kind: 'range',
      min: 2000,
      max: 6500,
      step: 50,
      unit: 'K'
    })
  })

  it('leaves the unit out unless one was actually stored', () => {
    expect(rangeControl(numericScale(0, 100, 1), '').unit).toBeUndefined()
    expect(rangeControl(numericScale(0, 100, 1), undefined).unit).toBeUndefined()
    // A number here would be rendered beside the value as if it were a unit.
    expect(rangeControl(numericScale(0, 100, 1), 17).unit).toBeUndefined()
  })
})

describe('commandOr', () => {
  it('keeps a configured command and falls back to the standard one', () => {
    expect(commandOr('OPEN', 'ON')).toBe('OPEN')
    expect(commandOr('', 'ON')).toBe('ON')
    expect(commandOr(undefined, 'ON')).toBe('ON')
    expect(commandOr(100, 'ON')).toBe('ON')
  })
})

describe('stepDecimals', () => {
  it('shows the digits the step resolves, and no more', () => {
    expect(stepDecimals(1)).toBe(0)
    expect(stepDecimals(5)).toBe(0)
    expect(stepDecimals(0.1)).toBe(1)
    expect(stepDecimals(0.25)).toBe(2)
    expect(stepDecimals(0.000001)).toBe(6)
  })
})
