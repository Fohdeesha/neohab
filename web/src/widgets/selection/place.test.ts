import { describe, expect, it } from 'vitest'
import { MENU_MARGIN, placeMenu } from './place'

const view = { width: 1000, height: 800 }
const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h })

describe('placeMenu', () => {
  it('opens under the control when the list fits there', () => {
    const p = placeMenu(box(400, 100, 200, 40), view, { width: 180, height: 300 })
    expect(p.top).toBe(144)
    expect(p.bottom).toBeUndefined()
    expect(p.maxHeight).toBe(800 - 140 - 4 - MENU_MARGIN)
  })

  it('opens over the control near the bottom of the window', () => {
    const p = placeMenu(box(400, 700, 200, 40), view, { width: 180, height: 300 })
    expect(p.top).toBeUndefined()
    expect(p.bottom).toBe(800 - 700 + 4)
    expect(p.maxHeight).toBe(700 - 4 - MENU_MARGIN)
  })

  it('takes the roomier side when the list fits neither, and scrolls', () => {
    const p = placeMenu(box(400, 300, 200, 40), view, { width: 180, height: 2000 })
    expect(p.top).toBe(344)
    expect(p.maxHeight).toBe(800 - 340 - 4 - MENU_MARGIN)
  })

  it('is never narrower than the control and centres on it', () => {
    const p = placeMenu(box(400, 100, 200, 40), view, { width: 120, height: 100 })
    expect(p.width).toBe(200)
    expect(p.left).toBe(400)
    const wide = placeMenu(box(400, 100, 200, 40), view, { width: 300, height: 100 })
    expect(wide.left + wide.width / 2).toBe(500)
  })

  it('stays inside the window at either edge', () => {
    const l = placeMenu(box(0, 100, 60, 40), view, { width: 300, height: 100 })
    expect(l.left).toBe(MENU_MARGIN)
    const r = placeMenu(box(960, 100, 40, 40), view, { width: 300, height: 100 })
    expect(r.left + r.width).toBe(1000 - MENU_MARGIN)
  })

  it('is no wider than the window on a phone', () => {
    const p = placeMenu(box(10, 100, 300, 40), { width: 320, height: 640 }, { width: 900, height: 100 })
    expect(p.width).toBe(320 - 2 * MENU_MARGIN)
    expect(p.left).toBe(MENU_MARGIN)
  })

  it('does not go negative in a window too small to hold it', () => {
    const p = placeMenu(box(0, 0, 10, 10), { width: 10, height: 10 }, { width: 100, height: 100 })
    expect(p.width).toBe(0)
    expect(p.maxHeight).toBe(0)
  })
})
