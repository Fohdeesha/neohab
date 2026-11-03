import { describe, expect, it } from 'vitest'
import { edgeStep, EDGE_BAND_PX, MAX_STEP_PX } from './edgeScroll'

describe('edgeStep', () => {
  const top = 60
  const bottom = 900

  it('leaves the page alone away from the edges', () => {
    expect(edgeStep(top + EDGE_BAND_PX + 1, top, bottom)).toBe(0)
    expect(edgeStep(500, top, bottom)).toBe(0)
    expect(edgeStep(bottom - EDGE_BAND_PX - 1, top, bottom)).toBe(0)
  })

  it('scrolls up near the top and down near the bottom', () => {
    expect(edgeStep(top + 10, top, bottom)).toBeLessThan(0)
    expect(edgeStep(bottom - 10, top, bottom)).toBeGreaterThan(0)
  })

  it('goes faster the closer the pointer gets, up to the cap', () => {
    expect(Math.abs(edgeStep(top + 5, top, bottom))).toBeGreaterThan(Math.abs(edgeStep(top + 40, top, bottom)))
    expect(edgeStep(top, top, bottom)).toBe(-MAX_STEP_PX)
    expect(edgeStep(bottom, top, bottom)).toBe(MAX_STEP_PX)
  })

  it('keeps full speed with the pointer over the sticky bar or below the window', () => {
    expect(edgeStep(10, top, bottom)).toBe(-MAX_STEP_PX)
    expect(edgeStep(bottom + 50, top, bottom)).toBe(MAX_STEP_PX)
  })

  it('narrows the band on a short window so the middle still holds still', () => {
    expect(edgeStep(150, 100, 300)).toBe(0)
    expect(edgeStep(110, 100, 300)).toBeLessThan(0)
  })

  it('does nothing when there is no room at all', () => {
    expect(edgeStep(100, 100, 100)).toBe(0)
    expect(edgeStep(100, 200, 100)).toBe(0)
    expect(edgeStep(NaN, 0, 800)).toBe(0)
  })
})
