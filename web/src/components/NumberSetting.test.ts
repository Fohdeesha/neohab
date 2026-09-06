import { describe, expect, it } from 'vitest'
import { parseNumberInput } from './NumberSetting'

describe('parseNumberInput', () => {
  it('reads a number', () => {
    expect(parseNumberInput('12')).toBe(12)
    expect(parseNumberInput(' 300 ')).toBe(300)
    expect(parseNumberInput('-40', 1)).toBe(-40)
  })

  it('answers null for anything not yet a number, so the field is left alone', () => {
    for (const raw of ['', '   ', 'abc', '-', '1e999']) expect(parseNumberInput(raw)).toBeNull()
  })

  it('rounds to whole numbers for the counts and pixel sizes it was written for', () => {
    expect(parseNumberInput('12.7')).toBe(13)
    expect(parseNumberInput('12.7', 5)).toBe(13)
    expect(parseNumberInput('12.7', 1)).toBe(13)
  })

  it('keeps fractions when the field says its step is fractional', () => {
    expect(parseNumberInput('12.5', 0.5)).toBe(12.5)
    expect(parseNumberInput('0.1', 0.1)).toBe(0.1)
    expect(parseNumberInput('-40.25', 0.25)).toBe(-40.25)
  })
})
