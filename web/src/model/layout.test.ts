/**
 * Layout maths.
 *
 * Two things are being defended here. One is the geometry itself - bumping, free-spot search,
 * the scaling rules. The other is that stored configuration is untrusted input: a backup, a
 * shared export or a hand edit is written verbatim, so every value read for arithmetic needs its
 * guard at the read. Those are the cases that have actually taken a dashboard down.
 */
import { describe, expect, it } from 'vitest'
import type { Dashboard, Rect, WidgetInstance } from './dashboard'
import {
  cellMetrics,
  clampRect,
  collides,
  columnsOf,
  DEFAULT_GAP,
  editZoom,
  findFreeSpot,
  gapOf,
  groupFrames,
  hiddenSurfaces,
  iconScale,
  planBump,
  POINTER_FLOOR_ROW,
  POINTER_FULL_ROW,
  POINTER_TEXT_FLOOR,
  projectDashboard,
  rectOf,
  SIDE_PANEL_WIDTH,
  stackedOrder,
  stackedTextScale,
  surfaceFor,
  tabletRects,
  textFloor,
  textScale,
  TOUCH_TEXT_FLOOR,
  widgetAccentInk,
  widgetTextScale,
} from './layout'

const w = (id: string, rect: Rect, config: Record<string, unknown> = {}): WidgetInstance => ({
  id,
  type: 'label',
  config,
  layout: { lg: rect },
})

const dash = (widgets: WidgetInstance[], over: Partial<Dashboard> = {}): Dashboard => ({
  version: 1,
  id: 'd',
  name: 'D',
  columns: 12,
  rowHeight: 'match',
  widgets,
  ...over,
})

describe('cellMetrics', () => {
  it('makes square cells for a match dashboard', () => {
    const m = cellMetrics(dash([], { columns: 4, gap: 0 }), 400)
    expect(m.colWidth).toBe(100)
    expect(m.rowHeight).toBe(100)
  })

  it('survives a column count of zero', () => {
    // `columns: 0` divided the cell width to Infinity and took the row height, the icon scale
    // and the whole grid with it.
    const m = cellMetrics(dash([], { columns: 0 as number, gap: 0 }), 400)
    expect(Number.isFinite(m.colWidth)).toBe(true)
    expect(Number.isFinite(m.rowHeight)).toBe(true)
    expect(m.rowHeight).toBeGreaterThanOrEqual(8)
  })

  it('floors a nonsense row height rather than collapsing the grid', () => {
    expect(cellMetrics(dash([], { rowHeight: 0 }), 400).rowHeight).toBeGreaterThanOrEqual(8)
    expect(cellMetrics(dash([], { rowHeight: -50 }), 400).rowHeight).toBeGreaterThanOrEqual(8)
    expect(cellMetrics(dash([], { rowHeight: NaN }), 400).rowHeight).toBeGreaterThanOrEqual(8)
  })

  it('reads a garbage column count as one column', () => {
    for (const columns of [0, -3, NaN, Infinity, undefined as unknown as number, 'six' as unknown as number]) {
      expect(columnsOf(dash([], { columns })), String(columns)).toBeGreaterThanOrEqual(1)
    }
  })

  it('reads a garbage gap as the default, and clamps a wild one', () => {
    // The column count and the row height were guarded and the gap was not, so a hand-edited
    // `gap: "wide"` made the cell width NaN and left the grid with nothing to lay out.
    for (const gap of ['wide' as unknown as number, NaN, Infinity, undefined as unknown as number]) {
      expect(gapOf(dash([], { gap })), String(gap)).toBe(DEFAULT_GAP)
    }
    expect(gapOf(dash([], { gap: -20 }))).toBe(0)
    expect(gapOf(dash([], { gap: 5000 }))).toBeLessThanOrEqual(400)
    const m = cellMetrics(dash([], { columns: 4, gap: 'wide' as unknown as number }), 400)
    expect(Number.isFinite(m.colWidth)).toBe(true)
    expect(Number.isFinite(m.rowHeight)).toBe(true)
  })

  it('never lets the gap eat the whole row', () => {
    // 60 columns at a 64px gap is wider than a phone; a negative column width would flow into
    // every scale and into grid-template-columns.
    const m = cellMetrics(dash([], { columns: 60, gap: 64 }), 360)
    expect(m.colWidth).toBeGreaterThan(0)
    expect(m.rowHeight).toBeGreaterThanOrEqual(8)
  })
})

describe('editZoom', () => {
  it('is 1 with no panel docked', () => {
    expect(editZoom(1400, false)).toBe(1)
    expect(editZoom(0, false)).toBe(1)
  })

  it('is 1 before the surface has been measured', () => {
    expect(editZoom(0, true)).toBe(1)
    expect(editZoom(-5, true)).toBe(1)
    expect(editZoom(Number.NaN, true)).toBe(1)
  })

  /**
   * The whole point: the grid laid out at the run-mode width and drawn into what the panel
   * leaves. So `available / zoom` has to come back to the width the surface had before the panel
   * took its share - the width run mode uses - whatever that width is.
   */
  it('lays the grid out at exactly the run-mode width', () => {
    for (const runWidth of [1896, 1200, 1024, 2560]) {
      const available = runWidth - SIDE_PANEL_WIDTH
      const zoom = editZoom(available, true)
      expect(available / zoom).toBeCloseTo(runWidth, 6)
      expect(zoom).toBeLessThan(1)
      expect(zoom).toBeGreaterThan(0)
    }
  })

  it('zooms less the more room there is', () => {
    expect(editZoom(2000, true)).toBeGreaterThan(editZoom(700, true))
  })
})

describe('rectOf', () => {
  it('reads a widget with no layout as a default rect', () => {
    expect(rectOf({ id: 'a', type: 'label', config: {}, layout: {} })).toEqual({ x: 0, y: 0, w: 3, h: 3 })
  })

  it('repairs a stored rect rather than passing nonsense to the grid', () => {
    // Stored rects were the one geometry value read without a guard: a string height made
    // findFreeSpot return NaN, and a negative y became a grid-row counted from the END of the
    // grid, so the widget rendered somewhere nobody put it.
    const bad = { x: -4, y: -5, w: 0, h: 'tall' } as unknown as Rect
    const r = rectOf({ id: 'a', type: 'label', config: {}, layout: { lg: bad } })
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.w).toBeGreaterThanOrEqual(1)
    expect(r.h).toBeGreaterThanOrEqual(1)
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true)
  })

  it('accepts a numeric string, as imported configurations carry', () => {
    const stored = { x: '2', y: '3', w: '4', h: '5' } as unknown as Rect
    expect(rectOf({ id: 'a', type: 'label', config: {}, layout: { lg: stored } })).toEqual({ x: 2, y: 3, w: 4, h: 5 })
  })

  it('leaves a good rect exactly as it was', () => {
    const good = { x: 1, y: 2, w: 3, h: 4 }
    expect(rectOf({ id: 'a', type: 'label', config: {}, layout: { lg: good } })).toEqual(good)
  })
})

describe('scaling', () => {
  it('renders a desktop-width dashboard at 1:1', () => {
    expect(iconScale(dash([], { columns: 12 }), cellMetrics(dash([], { columns: 12 }), 1920).rowHeight)).toBeCloseTo(1, 6)
  })

  it('never shrinks text below the readability floor', () => {
    const d = dash([], { columns: 36 })
    const rh = cellMetrics(d, 360).rowHeight
    // a 10px cell is far below either floor, so the floor is what decides
    expect(iconScale(d, rh)).toBeLessThan(TOUCH_TEXT_FLOOR)
    expect(textScale(d, rh, true)).toBe(TOUCH_TEXT_FLOOR)
    expect(textScale(d, rh, false)).toBe(TOUCH_TEXT_FLOOR)
  })

  it('under a finger the floor is flat; under a mouse it is the room the row has', () => {
    expect(TOUCH_TEXT_FLOOR).toBe(0.8)
    expect(POINTER_TEXT_FLOOR).toBe(1)
    for (const rh of [10, 70, POINTER_FLOOR_ROW, POINTER_FULL_ROW, 169, 400]) expect(textFloor(true, rh)).toBe(TOUCH_TEXT_FLOOR)
    // full size once the row reaches the full-text height, and never above it
    expect(textFloor(false, POINTER_FULL_ROW)).toBe(POINTER_TEXT_FLOOR)
    expect(textFloor(false, 169)).toBe(POINTER_TEXT_FLOOR)
    expect(textFloor(false, 400)).toBe(POINTER_TEXT_FLOOR)
    // easing across the band, never under the touch floor
    expect(textFloor(false, (POINTER_FLOOR_ROW + POINTER_FULL_ROW) / 2)).toBeCloseTo(0.9, 6)
    expect(textFloor(false, 87)).toBeCloseTo(0.8267, 3)
    expect(textFloor(false, POINTER_FLOOR_ROW)).toBe(TOUCH_TEXT_FLOOR)
    expect(textFloor(false, 70)).toBe(TOUCH_TEXT_FLOOR)
    expect(textFloor(false, 0)).toBe(TOUCH_TEXT_FLOOR)
    expect(textFloor(false, NaN)).toBe(TOUCH_TEXT_FLOOR)
  })

  it('a mouse-driven desk monitor never shrinks text: a 12-column board at 1270px', () => {
    // Jon's 1200p monitor with the browser sidebar: 100px rows, which used to read 12.8px
    const d = dash([], { columns: 12, gap: 4 })
    const rh = cellMetrics(d, 1270).rowHeight
    expect(rh).toBeGreaterThanOrEqual(POINTER_FULL_ROW)
    expect(iconScale(d, rh)).toBeLessThan(TOUCH_TEXT_FLOOR)
    expect(textScale(d, rh, true)).toBe(TOUCH_TEXT_FLOOR)
    expect(textScale(d, rh, false)).toBe(POINTER_TEXT_FLOOR)
  })

  it('leaves a cell that is already above the floor alone, whichever pointer', () => {
    const d = dash([], { columns: 12 })
    const rh = cellMetrics(d, 2560).rowHeight
    expect(textScale(d, rh, false)).toBeGreaterThan(1)
    expect(textScale(d, rh, true)).toBeCloseTo(textScale(d, rh, false), 6)
  })

  it('applies the dashboard text-size multiplier on top, clamped', () => {
    const d = dash([], { columns: 12, textSize: 150 })
    const plain = dash([], { columns: 12 })
    const unit = cellMetrics(d, 1920).rowHeight
    expect(textScale(d, unit, true)).toBeCloseTo(textScale(plain, unit, true) * 1.5, 6)
    expect(textScale(dash([], { textSize: 10_000 }), unit, true)).toBeLessThanOrEqual(textScale(plain, unit, true) * 3)
  })

  it('sizes stacked rows by the room the row actually has', () => {
    const d = dash([], { columns: 8 })
    const unit = cellMetrics(d, 1280).rowHeight
    // a tall row reads at full size; a short one eases back toward the floor
    expect(stackedTextScale(d, unit, 200, true)).toBeGreaterThan(stackedTextScale(d, unit, 40, true))
    expect(stackedTextScale(d, unit, 200, true)).toBeLessThanOrEqual(1)
    // the mouse floor never exceeds the stack's own room term, so the two pointers agree row for row
    for (const h of [40, 80, 87, 96, 100, 200]) expect(stackedTextScale(d, unit, h, false)).toBeCloseTo(stackedTextScale(d, unit, h, true), 6)
  })

  it('reads a widget text size stored as a string', () => {
    expect(widgetTextScale(w('a', { x: 0, y: 0, w: 1, h: 1 }, { textSize: '150' }))).toBeCloseTo(1.5)
    expect(widgetTextScale(w('a', { x: 0, y: 0, w: 1, h: 1 }, { textSize: 100 }))).toBeUndefined()
    expect(widgetTextScale(w('a', { x: 0, y: 0, w: 1, h: 1 }, { textSize: 'huge' }))).toBeUndefined()
  })
})

describe('accent ink', () => {
  it('derives readable ink for a tile with an accent colour of its own', () => {
    expect(widgetAccentInk(w('a', { x: 0, y: 0, w: 1, h: 1 }, { accentColor: '#ffd23c' }))).toBe('#10161c')
    expect(widgetAccentInk(w('a', { x: 0, y: 0, w: 1, h: 1 }, { accentColor: '#0b3d91' }))).toBe('#ffffff')
  })

  it('leaves the theme ink alone when there is no accent, or none it can read', () => {
    expect(widgetAccentInk(w('a', { x: 0, y: 0, w: 1, h: 1 }))).toBeUndefined()
    expect(widgetAccentInk(w('a', { x: 0, y: 0, w: 1, h: 1 }, { accentColor: 'rebeccapurple' }))).toBeUndefined()
  })
})

/*
 * The shapes a stored dashboard can have that the editor never writes. A widget with no `layout`
 * key at all, and a `widgets` that is not a list, both come from the same place as every other
 * case in this file: a backup, a partial export, a hand edit or a half-finished migration. Each
 * of these threw before it was guarded, and a throw here is not one tile - it is the whole
 * dashboard view, above every widget boundary there is.
 */
describe('a dashboard whose shape is wrong', () => {
  const shapeless = { id: 'a', type: 'label', config: {} } as unknown as WidgetInstance

  it('reads a widget with no layout key at all', () => {
    expect(() => rectOf(shapeless)).not.toThrow()
    expect(rectOf(shapeless)).toEqual({ x: 0, y: 0, w: 3, h: 3 })
    expect(rectOf({ ...shapeless, layout: null } as unknown as WidgetInstance)).toEqual({ x: 0, y: 0, w: 3, h: 3 })
  })

  it('treats a widgets list that is not a list as empty, rather than throwing', () => {
    for (const widgets of [{}, null, undefined, 'two', 42]) {
      const d = dash([], { widgets } as unknown as Partial<Dashboard>)
      expect(() => stackedOrder(d)).not.toThrow()
      expect(stackedOrder(d)).toEqual([])
      expect(() => findFreeSpot(d, 2, 2)).not.toThrow()
      expect(findFreeSpot(d, 2, 2)).toEqual({ x: 0, y: 0, w: 2, h: 2 })
      expect(() => tabletRects({ ...d, mdColumns: 6 })).not.toThrow()
    }
  })

  it('draws no panel frames for a widgets list that is not a list', () => {
    expect(() => groupFrames({} as never)).not.toThrow()
    expect(groupFrames({} as never)).toEqual([])
  })
})

describe('clampRect', () => {
  it('keeps a rect inside the grid', () => {
    expect(clampRect({ x: 10, y: 0, w: 6, h: 2 }, 12)).toEqual({ x: 6, y: 0, w: 6, h: 2 })
    expect(clampRect({ x: -4, y: -2, w: 3, h: 3 }, 12)).toEqual({ x: 0, y: 0, w: 3, h: 3 })
    expect(clampRect({ x: 0, y: 0, w: 99, h: 1 }, 12)).toEqual({ x: 0, y: 0, w: 12, h: 1 })
    expect(clampRect({ x: 0, y: 0, w: 0, h: 0 }, 12)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('findFreeSpot', () => {
  it('finds the topmost-leftmost gap', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 2, h: 2 })], { columns: 4 })
    expect(findFreeSpot(d, 2, 2)).toEqual({ x: 2, y: 0, w: 2, h: 2 })
  })

  it('goes below everything when nothing fits', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 4, h: 3 })], { columns: 4 })
    expect(findFreeSpot(d, 4, 1)).toEqual({ x: 0, y: 3, w: 4, h: 1 })
  })

  it('still finds a spot on a dashboard holding one corrupt rect', () => {
    // A single unreadable height made `maxY` NaN, so the search loop never ran and every widget
    // added from then on was stored at `y: NaN`.
    const broken = { id: 'a', type: 'label', config: {}, layout: { lg: { x: 0, y: 0, w: 2, h: 'tall' } } }
    const d = dash([broken as unknown as WidgetInstance], { columns: 4 })
    const spot = findFreeSpot(d, 2, 2)
    for (const v of Object.values(spot)) expect(Number.isFinite(v)).toBe(true)
  })

  /*
   * A pasted payload is untrusted: `JSON.parse('{"w":1e999}')` gives Infinity, which `parseClipboard`
   * used to accept as "a number". `Math.max(1, Math.min(NaN, columns))` is NaN, so the x loop's
   * condition is false, the search falls straight through to its final return, and the NaN size
   * goes on to be written into the dashboard.
   */
  it('answers with a usable rect even when asked for a size that is not a number', () => {
    for (const [width, height] of [
      [NaN, NaN],
      [Infinity, Infinity],
      [-Infinity, 3],
      [2, NaN],
    ]) {
      const r = findFreeSpot(dash([]), width, height)
      for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isFinite(v)).toBe(true)
      expect(r.w).toBeGreaterThanOrEqual(1)
      expect(r.h).toBeGreaterThanOrEqual(1)
      expect(r.x + r.w).toBeLessThanOrEqual(12)
    }
  })

  it('narrows a widget too wide for the grid rather than overflowing it', () => {
    expect(findFreeSpot(dash([], { columns: 3 }), 10, 1).w).toBe(3)
  })
})

describe('planBump', () => {
  const same = { w: 2, h: 2 }

  it('trades places with one equal-sized neighbour, moving nothing else', () => {
    const d = dash([
      w('a', { x: 0, y: 0, ...same }),
      w('b', { x: 2, y: 0, ...same }),
      w('c', { x: 4, y: 0, ...same }),
    ])
    const plan = planBump(d, 'a', { x: 2, y: 0, ...same })!
    expect(plan.size).toBe(1)
    expect(plan.get('b')).toEqual({ x: 0, y: 0, ...same })
  })

  it('pushes occupants down, keeping their stacking order', () => {
    const d = dash([
      w('a', { x: 0, y: 0, w: 4, h: 1 }),
      w('b', { x: 0, y: 2, w: 2, h: 1 }),
      w('c', { x: 0, y: 3, w: 2, h: 1 }),
    ])
    const plan = planBump(d, 'a', { x: 0, y: 2, w: 4, h: 1 })!
    expect(plan.get('b')!.y).toBe(3)
    expect(plan.get('c')!.y).toBeGreaterThan(plan.get('b')!.y)
  })

  it('reports an empty plan when the target is already free', () => {
    const d = dash([w('a', { x: 0, y: 0, ...same })])
    expect(planBump(d, 'a', { x: 4, y: 4, ...same })!.size).toBe(0)
  })

  it('produces a legal arrangement, never an overlapping one', () => {
    const d = dash([
      w('a', { x: 0, y: 0, w: 2, h: 2 }),
      w('b', { x: 2, y: 0, w: 3, h: 2 }),
      w('c', { x: 2, y: 2, w: 3, h: 2 }),
    ])
    const target = { x: 2, y: 0, w: 2, h: 2 }
    const plan = planBump(d, 'a', target)!
    const at = (id: string) => plan.get(id) ?? d.widgets.find((x) => x.id === id)!.layout.lg!
    for (const id of ['b', 'c']) expect(collides(target, at(id)), id).toBe(false)
    expect(collides(at('b'), at('c'))).toBe(false)
  })
})

describe('surfaces', () => {
  it('picks the surface from the container width', () => {
    expect(surfaceFor(390)).toBe('phone')
    expect(surfaceFor(1000)).toBe('tablet')
    expect(surfaceFor(1600)).toBe('desktop')
  })

  it('reads hideOn tolerantly, ignoring anything that is not a surface', () => {
    expect(hiddenSurfaces(w('a', { x: 0, y: 0, w: 1, h: 1 }, { hideOn: ['phone', 'nonsense'] }))).toEqual(['phone'])
    expect(hiddenSurfaces(w('a', { x: 0, y: 0, w: 1, h: 1 }, { hideOn: 'tablet' }))).toEqual(['tablet'])
    expect(hiddenSurfaces(w('a', { x: 0, y: 0, w: 1, h: 1 }, { hideOn: 42 }))).toEqual([])
  })
})

describe('the tablet layout', () => {
  it('copies the desktop rects when the grids are the same width', () => {
    const d = dash([w('a', { x: 3, y: 1, w: 2, h: 2 })], { columns: 12, mdColumns: 12 })
    expect(tabletRects(d).get('a')).toEqual({ x: 3, y: 1, w: 2, h: 2 })
  })

  it('clamps a stored tablet rect that is wider than its grid', () => {
    // An imported or hand-edited layout.md can be wider than the grid it lands in, and would
    // otherwise create implicit columns and lay the whole dashboard out against them.
    const widget: WidgetInstance = {
      id: 'a',
      type: 'label',
      config: {},
      layout: { lg: { x: 0, y: 0, w: 2, h: 2 }, md: { x: 0, y: 0, w: 9, h: 2 } },
    }
    const d = dash([widget], { columns: 12, mdColumns: 4 })
    expect(tabletRects(d).get('a')!.w).toBeLessThanOrEqual(4)
    expect(projectDashboard(d, 'md').columns).toBe(4)
  })

  /*
   * `rectOf` repairs `layout.lg` field by field because stored configuration is untrusted, and
   * `clampRect` CLAMPS but does not REPAIR: `Math.min('wide', 12)` is NaN, and NaN survives every
   * comparison after it. The tablet slot was the one rect reader with no repair, and
   * `setEditBreakpoint` writes the result straight back into the saved dashboard.
   */
  it('repairs a stored tablet rect whose fields are not numbers, in both branches', () => {
    const hostile = { x: 'left', y: 0, w: 'wide', h: 2 } as unknown as Rect
    for (const mdColumns of [6, 12]) {
      const widget: WidgetInstance = {
        id: 'a',
        type: 'label',
        config: {},
        layout: { lg: { x: 0, y: 0, w: 2, h: 2 }, md: hostile },
      }
      const rect = tabletRects(dash([widget], { columns: 12, mdColumns })).get('a')!
      for (const v of [rect.x, rect.y, rect.w, rect.h]) expect(Number.isFinite(v)).toBe(true)
      expect(rect.w).toBeGreaterThanOrEqual(1)
      expect(rect.h).toBeGreaterThanOrEqual(1)
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.w).toBeLessThanOrEqual(mdColumns)
    }
  })

  it('carries no NaN into the rects a grid is rendered from', () => {
    const widget: WidgetInstance = {
      id: 'a',
      type: 'label',
      config: {},
      layout: { lg: { x: 0, y: 0, w: 2, h: 2 }, md: { w: null } as unknown as Rect },
    }
    const projected = projectDashboard(dash([widget], { columns: 12, mdColumns: 6 }), 'md')
    const r = projected.widgets[0].layout.lg!
    for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isFinite(v)).toBe(true)
  })

  it('reflows into a narrower grid without overlapping', () => {
    const d = dash(
      [w('a', { x: 0, y: 0, w: 6, h: 2 }), w('b', { x: 6, y: 0, w: 6, h: 2 })],
      { columns: 12, mdColumns: 6 }
    )
    const rects = [...tabletRects(d).values()]
    expect(collides(rects[0], rects[1])).toBe(false)
    for (const r of rects) expect(r.x + r.w).toBeLessThanOrEqual(6)
  })
})

describe('stackedOrder', () => {
  it('follows the grid row by row when nothing was pinned', () => {
    const d = dash([
      w('bottom', { x: 0, y: 5, w: 1, h: 1 }),
      w('topright', { x: 4, y: 0, w: 1, h: 1 }),
      w('topleft', { x: 0, y: 0, w: 1, h: 1 }),
    ])
    expect(stackedOrder(d).map((x) => x.id)).toEqual(['topleft', 'topright', 'bottom'])
  })

  it('honours a pinned order and puts unlisted widgets after it', () => {
    const d = dash(
      [w('a', { x: 0, y: 0, w: 1, h: 1 }), w('b', { x: 0, y: 1, w: 1, h: 1 }), w('c', { x: 0, y: 2, w: 1, h: 1 })],
      { stackOrder: ['c', 'a'] }
    )
    expect(stackedOrder(d).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('ignores stale ids in the pinned order', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 1, h: 1 })], { stackOrder: ['gone', 'a'] })
    expect(stackedOrder(d).map((x) => x.id)).toEqual(['a'])
  })
})

describe('groupFrames', () => {
  it('draws one frame around every member of a group', () => {
    const frames = groupFrames([
      w('a', { x: 1, y: 1, w: 2, h: 1 }, { group: 'Left' }),
      w('b', { x: 4, y: 3, w: 2, h: 2 }, { group: 'Left' }),
      w('c', { x: 0, y: 0, w: 1, h: 1 }),
    ])
    expect(frames).toHaveLength(1)
    expect(frames[0].rect).toEqual({ x: 1, y: 1, w: 5, h: 4 })
  })

  it('keeps groups apart and takes the first member colour', () => {
    const frames = groupFrames([
      w('a', { x: 0, y: 0, w: 1, h: 1 }, { group: 'One', accentColor: '#ff0000' }),
      w('b', { x: 3, y: 0, w: 1, h: 1 }, { group: 'Two' }),
    ])
    expect(frames.map((f) => f.group)).toEqual(['One', 'Two'])
    expect(frames[0].color).toBe('#ff0000')
    expect(frames[1].color).toBeUndefined()
  })

  it('ignores a group name that is whitespace or absurdly long', () => {
    expect(groupFrames([w('a', { x: 0, y: 0, w: 1, h: 1 }, { group: '   ' })])).toHaveLength(0)
    expect(groupFrames([w('a', { x: 0, y: 0, w: 1, h: 1 }, { group: 'x'.repeat(200) })])).toHaveLength(0)
  })
})
