/**
 * Layout maths.
 *
 * Two things are being defended here. One is the geometry itself — bumping, free-spot search,
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
  findFreeSpot,
  gapOf,
  groupFrames,
  hiddenSurfaces,
  iconScale,
  MIN_TEXT_SCALE,
  planBump,
  projectDashboard,
  rectOf,
  stackedOrder,
  stackedTextScale,
  surfaceFor,
  tabletRects,
  textScale,
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
    expect(textScale(d, cellMetrics(d, 360).rowHeight)).toBeGreaterThanOrEqual(MIN_TEXT_SCALE)
  })

  it('applies the dashboard text-size multiplier on top, clamped', () => {
    const d = dash([], { columns: 12, textSize: 150 })
    const plain = dash([], { columns: 12 })
    const unit = cellMetrics(d, 1920).rowHeight
    expect(textScale(d, unit)).toBeCloseTo(textScale(plain, unit) * 1.5, 6)
    expect(textScale(dash([], { textSize: 10_000 }), unit)).toBeLessThanOrEqual(textScale(plain, unit) * 3)
  })

  it('sizes stacked rows by the room the row actually has', () => {
    const d = dash([], { columns: 8 })
    const unit = cellMetrics(d, 1280).rowHeight
    // a tall row reads at full size; a short one eases back toward the floor
    expect(stackedTextScale(d, unit, 200)).toBeGreaterThan(stackedTextScale(d, unit, 40))
    expect(stackedTextScale(d, unit, 200)).toBeLessThanOrEqual(1)
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
