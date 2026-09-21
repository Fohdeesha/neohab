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
  hiddenAfterRemoval,
  hiddenAfterShowing,
  hiddenSurfaces,
  iconScale,
  layoutForNewWidget,
  MD_BELOW,
  planBump,
  planRemoval,
  POINTER_FLOOR_ROW,
  POINTER_FULL_ROW,
  POINTER_TEXT_FLOOR,
  projectDashboard,
  rectOf,
  SIDE_PANEL_WIDTH,
  STACK_BELOW,
  stackedCellHeight,
  stackedOrder,
  stackedTextScale,
  surfaceBounds,
  surfaceFor,
  surfacesOf,
  tabletRects,
  textFloor,
  textScale,
  TOUCH_TEXT_FLOOR,
  widgetAccentInk,
  widgetsOf,
  widgetTextScale
} from './layout'

const w = (id: string, rect: Rect, config: Record<string, unknown> = {}): WidgetInstance => ({
  id,
  type: 'label',
  config,
  layout: { lg: rect }
})

const dash = (widgets: WidgetInstance[], over: Partial<Dashboard> = {}): Dashboard => ({
  version: 1,
  id: 'd',
  name: 'D',
  columns: 12,
  rowHeight: 'match',
  widgets,
  ...over
})

describe('cellMetrics', () => {
  it('makes square cells for a match dashboard', () => {
    const m = cellMetrics(dash([], { columns: 4, gap: 0 }), 400)
    expect(m.colWidth).toBe(100)
    expect(m.rowHeight).toBe(100)
  })

  it('survives a column count of zero', () => {
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
    expect(iconScale(d, rh)).toBeLessThan(TOUCH_TEXT_FLOOR)
    expect(textScale(d, rh, true)).toBe(TOUCH_TEXT_FLOOR)
    expect(textScale(d, rh, false)).toBe(TOUCH_TEXT_FLOOR)
  })

  it('under a finger the floor is flat; under a mouse it is the room the row has', () => {
    expect(TOUCH_TEXT_FLOOR).toBe(0.8)
    expect(POINTER_TEXT_FLOOR).toBe(1)
    for (const rh of [10, 70, POINTER_FLOOR_ROW, POINTER_FULL_ROW, 169, 400]) expect(textFloor(true, rh)).toBe(TOUCH_TEXT_FLOOR)
    expect(textFloor(false, POINTER_FULL_ROW)).toBe(POINTER_TEXT_FLOOR)
    expect(textFloor(false, 169)).toBe(POINTER_TEXT_FLOOR)
    expect(textFloor(false, 400)).toBe(POINTER_TEXT_FLOOR)
    expect(textFloor(false, (POINTER_FLOOR_ROW + POINTER_FULL_ROW) / 2)).toBeCloseTo(0.9, 6)
    expect(textFloor(false, 87)).toBeCloseTo(0.8267, 3)
    expect(textFloor(false, POINTER_FLOOR_ROW)).toBe(TOUCH_TEXT_FLOOR)
    expect(textFloor(false, 70)).toBe(TOUCH_TEXT_FLOOR)
    expect(textFloor(false, 0)).toBe(TOUCH_TEXT_FLOOR)
    expect(textFloor(false, NaN)).toBe(TOUCH_TEXT_FLOOR)
  })

  it('a mouse-driven desk monitor never shrinks text: a 12-column board at 1270px', () => {
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
    expect(stackedTextScale(d, unit, 200, true)).toBeGreaterThan(stackedTextScale(d, unit, 40, true))
    expect(stackedTextScale(d, unit, 200, true)).toBeLessThanOrEqual(1)
    for (const h of [40, 80, 87, 96, 100, 200])
      expect(stackedTextScale(d, unit, h, false)).toBeCloseTo(stackedTextScale(d, unit, h, true), 6)
  })

  it('reads a widget text size stored as a string', () => {
    expect(widgetTextScale(w('a', { x: 0, y: 0, w: 1, h: 1 }, { textSize: '150' }))).toBeCloseTo(1.5)
    expect(widgetTextScale(w('a', { x: 0, y: 0, w: 1, h: 1 }, { textSize: 100 }))).toBeUndefined()
    expect(widgetTextScale(w('a', { x: 0, y: 0, w: 1, h: 1 }, { textSize: 'huge' }))).toBeUndefined()
  })
})

describe('stackedCellHeight', () => {
  const PHONE = 369
  const rect = (over: Partial<Rect> = {}): Rect => ({ x: 0, y: 0, w: 12, h: 6, ...over })

  it('keeps the row count for a widget whose content stretches', () => {
    const d = dash([], { gap: 6 })
    const unit = cellMetrics(d, 1280).rowHeight
    expect(stackedCellHeight(d, rect(), PHONE, 0, false)).toBe(Math.round(6 * unit))
  })

  it('gives a fixed-shape widget the proportion it was authored at', () => {
    const d = dash([], { gap: 6 })
    const h = stackedCellHeight(d, rect(), PHONE, 0, true)
    // authored 12 columns by 6 rows is 2:1 at the reference width, so full width on a phone is half of it
    expect(h).toBeGreaterThan(PHONE / 2 - 4)
    expect(h).toBeLessThan(PHONE / 2 + 4)
    expect(h).toBeLessThan(stackedCellHeight(d, rect(), PHONE, 0, false))
  })

  it('never makes a tall narrow tile taller than the row count', () => {
    const d = dash([], { gap: 6 })
    const tall = rect({ w: 3, h: 8 })
    expect(stackedCellHeight(d, tall, PHONE, 0, true)).toBe(stackedCellHeight(d, tall, PHONE, 0, false))
  })

  it('honours the minimum height either way', () => {
    const d = dash([], { gap: 6 })
    expect(stackedCellHeight(d, rect(), PHONE, 400, true)).toBe(400)
    expect(stackedCellHeight(d, rect({ h: 1 }), PHONE, 400, false)).toBe(400)
  })

  it('follows a numeric row height rather than assuming square cells', () => {
    const square = dash([], { gap: 6 })
    const squat = dash([], { gap: 6, rowHeight: 40 })
    expect(stackedCellHeight(squat, rect(), PHONE, 0, true)).toBeLessThan(stackedCellHeight(square, rect(), PHONE, 0, true))
  })

  it('survives a width of zero and a broken dashboard', () => {
    const d = dash([], { gap: 6 })
    expect(Number.isFinite(stackedCellHeight(d, rect(), 0, 0, true))).toBe(true)
    const broken = dash([], { columns: 0 as number, gap: 6 })
    expect(Number.isFinite(stackedCellHeight(broken, rect(), PHONE, 0, true))).toBe(true)
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
    const broken = { id: 'a', type: 'label', config: {}, layout: { lg: { x: 0, y: 0, w: 2, h: 'tall' } } }
    const d = dash([broken as unknown as WidgetInstance], { columns: 4 })
    const spot = findFreeSpot(d, 2, 2)
    for (const v of Object.values(spot)) expect(Number.isFinite(v)).toBe(true)
  })

  it('answers with a usable rect even when asked for a size that is not a number', () => {
    for (const [width, height] of [
      [NaN, NaN],
      [Infinity, Infinity],
      [-Infinity, 3],
      [2, NaN]
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
    const d = dash([w('a', { x: 0, y: 0, ...same }), w('b', { x: 2, y: 0, ...same }), w('c', { x: 4, y: 0, ...same })])
    const plan = planBump(d, 'a', { x: 2, y: 0, ...same })!
    expect(plan.size).toBe(1)
    expect(plan.get('b')).toEqual({ x: 0, y: 0, ...same })
  })

  it('pushes occupants down, keeping their stacking order', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 4, h: 1 }), w('b', { x: 0, y: 2, w: 2, h: 1 }), w('c', { x: 0, y: 3, w: 2, h: 1 })])
    const plan = planBump(d, 'a', { x: 0, y: 2, w: 4, h: 1 })!
    expect(plan.get('b')!.y).toBe(3)
    expect(plan.get('c')!.y).toBeGreaterThan(plan.get('b')!.y)
  })

  it('reports an empty plan when the target is already free', () => {
    const d = dash([w('a', { x: 0, y: 0, ...same })])
    expect(planBump(d, 'a', { x: 4, y: 4, ...same })!.size).toBe(0)
  })

  it('produces a legal arrangement, never an overlapping one', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 2, h: 2 }), w('b', { x: 2, y: 0, w: 3, h: 2 }), w('c', { x: 2, y: 2, w: 3, h: 2 })])
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

  it('follows the configured thresholds', () => {
    const bounds = surfaceBounds({ phoneBelow: 600, tabletBelow: 1000 })
    expect(surfaceFor(599, bounds)).toBe('phone')
    expect(surfaceFor(600, bounds)).toBe('tablet')
    expect(surfaceFor(999, bounds)).toBe('tablet')
    expect(surfaceFor(1000, bounds)).toBe('desktop')
    // the same widths under the built-in thresholds, so the test can fail for one reason only
    expect(surfaceFor(600)).toBe('phone')
    expect(surfaceFor(1000)).toBe('tablet')
  })

  it('falls back to the built-in thresholds for anything that is not a number', () => {
    for (const bad of [undefined, null, '', 'wide', NaN, {}, []]) {
      expect(surfaceBounds({ phoneBelow: bad, tabletBelow: bad })).toEqual({ phoneBelow: STACK_BELOW, tabletBelow: MD_BELOW })
    }
    expect(surfaceBounds(undefined)).toEqual({ phoneBelow: STACK_BELOW, tabletBelow: MD_BELOW })
    // a stored number as a string is what an imported or hand-edited settings component carries
    expect(surfaceBounds({ phoneBelow: '700', tabletBelow: '1100' })).toEqual({ phoneBelow: 700, tabletBelow: 1100 })
  })

  it('clamps each threshold to its own range', () => {
    expect(surfaceBounds({ phoneBelow: 1, tabletBelow: 1 })).toEqual({ phoneBelow: 320, tabletBelow: 480 })
    expect(surfaceBounds({ phoneBelow: 99999, tabletBelow: 99999 })).toEqual({ phoneBelow: 2000, tabletBelow: 4000 })
    expect(surfaceBounds({ phoneBelow: 700.6, tabletBelow: 1100.4 })).toEqual({ phoneBelow: 701, tabletBelow: 1100 })
  })

  it('never lets the tablet threshold swallow the tablet band', () => {
    // a tablet threshold at or under the phone one would leave no width that reads as a tablet at
    // all, so the whole surface would vanish with nothing on screen to say why
    expect(surfaceBounds({ phoneBelow: 900, tabletBelow: 900 })).toEqual({ phoneBelow: 900, tabletBelow: 901 })
    expect(surfaceBounds({ phoneBelow: 900, tabletBelow: 500 })).toEqual({ phoneBelow: 900, tabletBelow: 901 })
    const bounds = surfaceBounds({ phoneBelow: 900, tabletBelow: 500 })
    expect(surfaceFor(899, bounds)).toBe('phone')
    expect(surfaceFor(900, bounds)).toBe('tablet')
    expect(surfaceFor(901, bounds)).toBe('desktop')
  })

  it('reads hideOn tolerantly, ignoring anything that is not a surface', () => {
    expect(hiddenSurfaces(w('a', { x: 0, y: 0, w: 1, h: 1 }, { hideOn: ['phone', 'nonsense'] }))).toEqual(['phone'])
    expect(hiddenSurfaces(w('a', { x: 0, y: 0, w: 1, h: 1 }, { hideOn: 'tablet' }))).toEqual(['tablet'])
    expect(hiddenSurfaces(w('a', { x: 0, y: 0, w: 1, h: 1 }, { hideOn: 42 }))).toEqual([])
  })

  it('says which surfaces a breakpoint draws', () => {
    expect(surfacesOf('md')).toEqual(['tablet'])
    // the stack is the desktop layout reflowed, so lg speaks for the phone too
    expect(surfacesOf('lg')).toEqual(['desktop', 'phone'])
  })
})

describe('removing a widget', () => {
  const tablet = (widgets: WidgetInstance[]): Dashboard => dash(widgets, { mdColumns: 8 })

  it('is a plain delete while the dashboard has only one layout', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 2, h: 2 }), w('b', { x: 2, y: 0, w: 2, h: 2 })])
    expect(planRemoval(d, ['a'], 'lg')).toMatchObject({ deleted: ['a'], hidden: [] })
    expect(planRemoval(d, ['a'], 'md')).toMatchObject({ deleted: ['a'], hidden: [] })
  })

  it('takes a widget off the tablet layout only, once there is one', () => {
    const d = tablet([w('a', { x: 0, y: 0, w: 2, h: 2 })])
    const plan = planRemoval(d, ['a'], 'md')
    expect(plan).toMatchObject({ deleted: [], hidden: ['a'], scope: ['tablet'], kept: ['phone', 'desktop'] })
  })

  it('takes it off the desktop layout and the phone stack together', () => {
    const d = tablet([w('a', { x: 0, y: 0, w: 2, h: 2 })])
    const plan = planRemoval(d, ['a'], 'lg')
    expect(plan).toMatchObject({ deleted: [], hidden: ['a'], scope: ['desktop', 'phone'], kept: ['tablet'] })
    expect(hiddenAfterRemoval(d.widgets[0], plan.scope)).toEqual(['phone', 'desktop'])
  })

  it('deletes outright rather than leaving a widget showing nowhere', () => {
    // already off the tablet layout: taking it off the desktop one too would leave a widget that
    // renders on no screen at all and can only be found by hunting for it in the editor
    const d = tablet([w('a', { x: 0, y: 0, w: 2, h: 2 }, { hideOn: ['tablet'] })])
    expect(planRemoval(d, ['a'], 'lg')).toMatchObject({ deleted: ['a'], hidden: [] })
    // and the mirror: hidden on the desktop and the phone already, removed from the tablet layout
    const e = tablet([w('a', { x: 0, y: 0, w: 2, h: 2 }, { hideOn: ['desktop', 'phone'] })])
    expect(planRemoval(e, ['a'], 'md')).toMatchObject({ deleted: ['a'], hidden: [] })
  })

  it('keeps the surfaces a widget was already hidden on', () => {
    const d = tablet([w('a', { x: 0, y: 0, w: 2, h: 2 }, { hideOn: ['phone'] })])
    const plan = planRemoval(d, ['a'], 'md')
    expect(plan.hidden).toEqual(['a'])
    expect(hiddenAfterRemoval(d.widgets[0], plan.scope)).toEqual(['phone', 'tablet'])
  })

  it('sorts a mixed batch into the ones that go and the ones that stay', () => {
    const d = tablet([
      w('keep', { x: 0, y: 0, w: 2, h: 2 }),
      w('gone', { x: 2, y: 0, w: 2, h: 2 }, { hideOn: ['desktop', 'phone'] }),
      w('untouched', { x: 4, y: 0, w: 2, h: 2 })
    ])
    const plan = planRemoval(d, ['keep', 'gone'], 'md')
    expect(plan.deleted).toEqual(['gone'])
    expect(plan.hidden).toEqual(['keep'])
  })

  it('ignores ids that are not on the dashboard', () => {
    const d = tablet([w('a', { x: 0, y: 0, w: 2, h: 2 })])
    expect(planRemoval(d, ['nope'], 'md')).toMatchObject({ deleted: [], hidden: [] })
  })

  it('puts a widget back on the layout being edited without touching the others', () => {
    const widget = w('a', { x: 0, y: 0, w: 2, h: 2 }, { hideOn: ['phone', 'tablet'] })
    expect(hiddenAfterShowing(widget, surfacesOf('md'))).toEqual(['phone'])
    expect(hiddenAfterShowing(widget, surfacesOf('lg'))).toEqual(['tablet'])
  })
})

describe('placing a new widget', () => {
  const overlapsIn = (d: Dashboard, bp: 'lg' | 'md'): string[] => {
    const view = projectDashboard(d, bp)
    const out: string[] = []
    for (let i = 0; i < view.widgets.length; i++) {
      for (let j = i + 1; j < view.widgets.length; j++) {
        if (collides(rectOf(view.widgets[i]), rectOf(view.widgets[j]))) out.push(`${view.widgets[i].id}/${view.widgets[j].id}`)
      }
    }
    return out
  }
  const withLayout = (id: string, lg: Rect, md: Rect): WidgetInstance => ({ id, type: 'label', config: {}, layout: { lg, md } })

  it('gives a widget added on the desktop layout no tablet rect of its own', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 2, h: 2 })], { mdColumns: 8 })
    expect(layoutForNewWidget(d, 'lg', { x: 4, y: 0, w: 2, h: 2 })).toEqual({ lg: { x: 4, y: 0, w: 2, h: 2 } })
  })

  it('gives a widget added on the tablet layout a rect on both', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 2, h: 2 })], { columns: 12, mdColumns: 12 })
    const layout = layoutForNewWidget(d, 'md', { x: 4, y: 0, w: 2, h: 2 })
    expect(layout.md).toEqual({ x: 4, y: 0, w: 2, h: 2 })
    // the layouts have not drifted, so the same rect is free on both and the widget stays put
    expect(layout.lg).toEqual(layout.md)
  })

  it('finds a free spot on the desktop layout rather than reusing a tablet rect that is taken', () => {
    // 'a' fills the desktop top-left and has been moved right on the tablet layout, so the tablet
    // grid's free corner is the very cell the desktop grid has taken
    const d = dash([withLayout('a', { x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 })], { columns: 12, mdColumns: 8 })
    const layout = layoutForNewWidget(d, 'md', { x: 0, y: 0, w: 4, h: 4 })
    expect(layout.md).toEqual({ x: 0, y: 0, w: 4, h: 4 })
    expect(layout.lg).not.toEqual(layout.md)
    const after = { ...d, widgets: [...d.widgets, { id: 'new', type: 'label', config: {}, layout }] }
    expect(overlapsIn(after, 'lg')).toEqual([])
    expect(overlapsIn(after, 'md')).toEqual([])
  })

  it('clamps a rect wider than the layout it is being placed on', () => {
    const d = dash([], { columns: 12, mdColumns: 4 })
    const layout = layoutForNewWidget(d, 'md', { x: 0, y: 0, w: 8, h: 2 })
    expect(layout.md!.w).toBe(4)
    expect(layout.lg!.w).toBe(8)
  })
})

describe('the tablet layout', () => {
  it('copies the desktop rects when the grids are the same width', () => {
    const d = dash([w('a', { x: 3, y: 1, w: 2, h: 2 })], { columns: 12, mdColumns: 12 })
    expect(tabletRects(d).get('a')).toEqual({ x: 3, y: 1, w: 2, h: 2 })
  })

  it('fits a widget with no tablet rect around the ones that have been moved', () => {
    // the shape a real board reaches: a widget moved on the tablet layout, and one added later while
    // editing the desktop layout, which has no tablet rect of its own
    const moved: WidgetInstance = {
      id: 'chart',
      type: 'label',
      config: {},
      layout: { lg: { x: 0, y: 4, w: 6, h: 2 }, md: { x: 0, y: 4, w: 7, h: 2 } }
    }
    const added = w('timeline', { x: 6, y: 4, w: 6, h: 2 })
    const rects = tabletRects(dash([moved, added], { columns: 12 }))
    const a = rects.get('chart')!
    const b = rects.get('timeline')!
    expect(a).toEqual({ x: 0, y: 4, w: 7, h: 2 })
    expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
  })

  it('leaves a dashboard nobody has given a tablet rect exactly where it is', () => {
    const d = dash([w('a', { x: 3, y: 1, w: 2, h: 2 }), w('b', { x: 7, y: 0, w: 1, h: 1 })], { columns: 12 })
    const rects = tabletRects(d)
    expect(rects.get('a')).toEqual({ x: 3, y: 1, w: 2, h: 2 })
    expect(rects.get('b')).toEqual({ x: 7, y: 0, w: 1, h: 1 })
  })

  it('clamps a stored tablet rect that is wider than its grid', () => {
    const widget: WidgetInstance = {
      id: 'a',
      type: 'label',
      config: {},
      layout: { lg: { x: 0, y: 0, w: 2, h: 2 }, md: { x: 0, y: 0, w: 9, h: 2 } }
    }
    const d = dash([widget], { columns: 12, mdColumns: 4 })
    expect(tabletRects(d).get('a')!.w).toBeLessThanOrEqual(4)
    expect(projectDashboard(d, 'md').columns).toBe(4)
  })

  it('repairs a stored tablet rect whose fields are not numbers, in both branches', () => {
    const hostile = { x: 'left', y: 0, w: 'wide', h: 2 } as unknown as Rect
    for (const mdColumns of [6, 12]) {
      const widget: WidgetInstance = {
        id: 'a',
        type: 'label',
        config: {},
        layout: { lg: { x: 0, y: 0, w: 2, h: 2 }, md: hostile }
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
      layout: { lg: { x: 0, y: 0, w: 2, h: 2 }, md: { w: null } as unknown as Rect }
    }
    const projected = projectDashboard(dash([widget], { columns: 12, mdColumns: 6 }), 'md')
    const r = projected.widgets[0].layout.lg!
    for (const v of [r.x, r.y, r.w, r.h]) expect(Number.isFinite(v)).toBe(true)
  })

  it('reflows into a narrower grid without overlapping', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 6, h: 2 }), w('b', { x: 6, y: 0, w: 6, h: 2 })], { columns: 12, mdColumns: 6 })
    const rects = [...tabletRects(d).values()]
    expect(collides(rects[0], rects[1])).toBe(false)
    for (const r of rects) expect(r.x + r.w).toBeLessThanOrEqual(6)
  })

  // a rect past the column count lands in an implicit CSS grid track, which is auto-sized and
  // collapses to nothing: the widget draws as an 8px sliver at the right-hand edge with no error
  describe('the desktop projection clamps a rect the editor never saw', () => {
    it('pulls a widget placed past the last column back inside it', () => {
      const d = dash([w('a', { x: 8, y: 0, w: 2, h: 2 })], { columns: 4 })
      const r = projectDashboard(d, 'lg').widgets[0].layout.lg!
      expect(r).toEqual({ x: 2, y: 0, w: 2, h: 2 })
    })

    it('narrows a widget wider than the whole grid', () => {
      const d = dash([w('a', { x: 0, y: 1, w: 12, h: 3 })], { columns: 4 })
      expect(projectDashboard(d, 'lg').widgets[0].layout.lg).toEqual({ x: 0, y: 1, w: 4, h: 3 })
    })

    it('leaves an ordinary dashboard alone, object identity included', () => {
      const d = dash([w('a', { x: 0, y: 0, w: 6, h: 2 }), w('b', { x: 6, y: 0, w: 6, h: 2 })], { columns: 12 })
      expect(projectDashboard(d, 'lg')).toBe(d)
    })

    it('keeps every rect inside a column count that is not a usable number', () => {
      for (const columns of [0, -3, NaN, 'four', undefined]) {
        const d = dash([w('a', { x: 8, y: 0, w: 2, h: 2 })], { columns: columns as number })
        const r = projectDashboard(d, 'lg').widgets[0].layout.lg!
        expect(r.x + r.w).toBeLessThanOrEqual(columnsOf(d))
        expect(r.w).toBeGreaterThanOrEqual(1)
      }
    })

    it('does not disturb a stored tablet rect while clamping the desktop one', () => {
      const widget: WidgetInstance = {
        id: 'a',
        type: 'label',
        config: {},
        layout: { lg: { x: 9, y: 0, w: 3, h: 2 }, md: { x: 0, y: 0, w: 2, h: 2 } }
      }
      const projected = projectDashboard(dash([widget], { columns: 4 }), 'lg')
      expect(projected.widgets[0].layout.md).toEqual({ x: 0, y: 0, w: 2, h: 2 })
      expect(projected.widgets[0].layout.lg).toEqual({ x: 1, y: 0, w: 3, h: 2 })
    })

    it('survives a widgets field that is not a list', () => {
      const d = { ...dash([]), widgets: {} as unknown as WidgetInstance[] }
      expect(widgetsOf(projectDashboard(d, 'lg'))).toEqual([])
    })
  })
})

describe('stackedOrder', () => {
  it('follows the grid row by row when nothing was pinned', () => {
    const d = dash([
      w('bottom', { x: 0, y: 5, w: 1, h: 1 }),
      w('topright', { x: 4, y: 0, w: 1, h: 1 }),
      w('topleft', { x: 0, y: 0, w: 1, h: 1 })
    ])
    expect(stackedOrder(d).map((x) => x.id)).toEqual(['topleft', 'topright', 'bottom'])
  })

  it('honours a pinned order and puts unlisted widgets after it', () => {
    const d = dash([w('a', { x: 0, y: 0, w: 1, h: 1 }), w('b', { x: 0, y: 1, w: 1, h: 1 }), w('c', { x: 0, y: 2, w: 1, h: 1 })], {
      stackOrder: ['c', 'a']
    })
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
      w('c', { x: 0, y: 0, w: 1, h: 1 })
    ])
    expect(frames).toHaveLength(1)
    expect(frames[0].rect).toEqual({ x: 1, y: 1, w: 5, h: 4 })
  })

  it('keeps groups apart and takes the first member colour', () => {
    const frames = groupFrames([
      w('a', { x: 0, y: 0, w: 1, h: 1 }, { group: 'One', accentColor: '#ff0000' }),
      w('b', { x: 3, y: 0, w: 1, h: 1 }, { group: 'Two' })
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
