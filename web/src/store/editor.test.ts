import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Dashboard, Rect } from '../model/dashboard'
import { collides, rectOf } from '../model/layout'

// the store pulls in the widget registry, and some of that touches the browser as it loads
const noopEvents = { addEventListener: () => {}, removeEventListener: () => {} }
vi.stubGlobal('document', { ...noopEvents, documentElement: {}, visibilityState: 'visible' })
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
const session = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => session.get(k) ?? null,
  setItem: (k: string, v: string) => void session.set(k, v),
  removeItem: (k: string) => void session.delete(k)
})
vi.stubGlobal('window', {
  ...noopEvents,
  location: { hash: '', search: '', pathname: '/neohab/', origin: 'http://localhost', href: 'http://localhost/neohab/' },
  matchMedia: () => ({ matches: false, ...noopEvents })
})

const {
  dropDraftKeptThroughSignIn,
  isLeavingForSignIn,
  keepDraftThroughSignIn,
  resetPhoneLayout,
  resetTabletLayout,
  setEditBreakpoint,
  setWidgetRect,
  setWidgetRects,
  startEditing,
  takeDraftKeptThroughSignIn,
  undo,
  updateDashboardMeta,
  useEditorStore
} = await import('./editor')

const board = (): Dashboard => ({
  version: 3,
  id: 'd',
  name: 'D',
  columns: 12,
  rowHeight: 'match',
  widgets: ['a', 'b', 'c'].map((id, i) => ({ id, type: 'label', config: {}, layout: { lg: { x: i * 4, y: 0, w: 4, h: 2 } } }))
})

const rects = (): Record<string, Rect> => Object.fromEntries(useEditorStore.getState().draft!.widgets.map((w) => [w.id, rectOf(w)]))

describe('changing the column count', () => {
  beforeEach(() => startEditing(board()))

  it('lets 12 be typed over 11 without the 1 on the way squeezing every widget into one column', () => {
    const before = rects()
    updateDashboardMeta({ columns: 1 }, 'dash:columns')
    updateDashboardMeta({ columns: 12 }, 'dash:columns')
    expect(rects()).toEqual(before)
  })

  it('pushes widgets down on a narrower grid rather than laying them on top of each other', () => {
    updateDashboardMeta({ columns: 8 }, 'dash:columns')
    const out = Object.values(rects())
    for (let i = 0; i < out.length; i++) {
      expect(out[i].x + out[i].w).toBeLessThanOrEqual(8)
      for (let j = i + 1; j < out.length; j++) expect(collides(out[i], out[j])).toBe(false)
    }
  })

  it('is still one step to undo', () => {
    const before = rects()
    updateDashboardMeta({ columns: 1 }, 'dash:columns')
    updateDashboardMeta({ columns: 6 }, 'dash:columns')
    undo()
    expect(rects()).toEqual(before)
    expect(useEditorStore.getState().draft!.columns).toBe(12)
  })
})

describe('opening the editor on the layout run mode was showing', () => {
  // a moved widget and one added later on the desktop layout, which has no tablet rect of its own
  const tablet = (): Dashboard => ({
    ...board(),
    mdColumns: 6,
    widgets: [
      { id: 'a', type: 'label', config: {}, layout: { lg: { x: 0, y: 0, w: 4, h: 2 }, md: { x: 2, y: 0, w: 4, h: 2 } } },
      { id: 'b', type: 'label', config: {}, layout: { lg: { x: 4, y: 0, w: 4, h: 2 } } }
    ]
  })

  it('opens on the tablet layout when that is what was on screen', () => {
    startEditing(tablet(), 'md')
    expect(useEditorStore.getState().bp).toBe('md')
  })

  it('pins the fitted widgets where run mode drew them, without calling that a change', () => {
    startEditing(tablet(), 'md')
    const s = useEditorStore.getState()
    expect(s.draft!.widgets.every((w) => w.layout.md)).toBe(true)
    expect(s.draft!.widgets.find((w) => w.id === 'a')!.layout.md).toEqual({ x: 2, y: 0, w: 4, h: 2 })
    expect(s.dirty).toBe(false)
    expect(s.undoStack).toHaveLength(0)
  })

  it('so a move on the tablet layout leaves the other widget where it was', () => {
    startEditing(tablet(), 'md')
    const before = useEditorStore.getState().draft!.widgets.find((w) => w.id === 'b')!.layout.md
    expect(setWidgetRect('a', { x: 0, y: 4, w: 4, h: 2 })).toBe(true)
    expect(useEditorStore.getState().draft!.widgets.find((w) => w.id === 'b')!.layout.md).toEqual(before)
  })

  it('leaves the saved dashboard alone', () => {
    const saved = tablet()
    startEditing(saved, 'md')
    expect(saved.widgets.find((w) => w.id === 'b')!.layout.md).toBeUndefined()
  })

  it('still opens on the desktop layout by default', () => {
    startEditing(tablet())
    const s = useEditorStore.getState()
    expect(s.bp).toBe('lg')
    expect(s.draft!.widgets.find((w) => w.id === 'b')!.layout.md).toBeUndefined()
  })

  it('switching to the tablet layout by hand is still one undoable change', () => {
    startEditing(tablet())
    setEditBreakpoint('md')
    const s = useEditorStore.getState()
    expect(s.dirty).toBe(true)
    expect(s.undoStack).toHaveLength(1)
    expect(s.draft!.widgets.every((w) => w.layout.md)).toBe(true)
  })
})

describe('dropping a selection that was dragged together', () => {
  beforeEach(() => startEditing(board()))

  it('moves every member in one undo step', () => {
    const before = rects()
    const moved = new Map([
      ['a', { x: 0, y: 3, w: 4, h: 2 }],
      ['b', { x: 4, y: 3, w: 4, h: 2 }]
    ])
    expect(setWidgetRects(moved)).toBe(true)
    expect(rects()).toEqual({ ...before, a: moved.get('a'), b: moved.get('b') })
    expect(useEditorStore.getState().undoStack).toHaveLength(1)
    undo()
    expect(rects()).toEqual(before)
  })

  it('refuses a drop onto a widget outside the group, and moves nothing', () => {
    const before = rects()
    expect(setWidgetRects(new Map([['a', { x: 4, y: 0, w: 4, h: 2 }]]))).toBe(false)
    expect(
      setWidgetRects(
        new Map([
          ['a', { x: 4, y: 1, w: 4, h: 2 }],
          ['b', { x: 8, y: 1, w: 4, h: 2 }]
        ])
      )
    ).toBe(false)
    expect(rects()).toEqual(before)
  })

  it('lets members land where another member started', () => {
    expect(
      setWidgetRects(
        new Map([
          ['a', { x: 4, y: 0, w: 4, h: 2 }],
          ['b', { x: 8, y: 0, w: 4, h: 2 }],
          ['c', { x: 0, y: 0, w: 4, h: 2 }]
        ])
      )
    ).toBe(true)
    expect(rects().a).toEqual({ x: 4, y: 0, w: 4, h: 2 })
  })

  it('makes no undo step for a group put back where it was', () => {
    expect(setWidgetRects(new Map(Object.entries(rects())))).toBe(true)
    expect(useEditorStore.getState().undoStack).toHaveLength(0)
  })
})

describe('resetting the tablet and phone layouts', () => {
  const custom = (): Dashboard => ({
    ...board(),
    mdColumns: 6,
    stackOrder: ['c', 'b', 'a'],
    widgets: [
      {
        id: 'a',
        type: 'label',
        config: { hideOn: ['tablet'] },
        layout: { lg: { x: 0, y: 0, w: 4, h: 2 }, md: { x: 2, y: 0, w: 4, h: 2 } }
      },
      { id: 'b', type: 'label', config: { hideOn: ['phone'] }, layout: { lg: { x: 4, y: 0, w: 4, h: 2 }, md: { x: 0, y: 2, w: 4, h: 2 } } },
      {
        id: 'c',
        type: 'label',
        config: { hideOn: ['desktop', 'phone'] },
        layout: { lg: { x: 8, y: 0, w: 4, h: 2 }, md: { x: 0, y: 4, w: 4, h: 2 } }
      }
    ]
  })
  const hideOn = (id: string) => useEditorStore.getState().draft!.widgets.find((w) => w.id === id)!.config.hideOn

  it('rebuilds the tablet layout from the desktop one, in one undo step', () => {
    startEditing(custom(), 'md')
    resetTabletLayout()
    const s = useEditorStore.getState()
    expect(s.bp).toBe('lg')
    expect(s.draft!.mdColumns).toBeUndefined()
    expect(s.draft!.widgets.every((w) => w.layout.md === undefined)).toBe(true)
    expect(hideOn('a')).toBeUndefined()
    expect(hideOn('b')).toEqual(['phone'])
    expect(hideOn('c')).toBeUndefined()
    expect(s.draft!.stackOrder).toEqual(['c', 'b', 'a'])
    expect(s.undoStack).toHaveLength(1)
  })

  it('rebuilds the phone layout from the desktop one, leaving the tablet layout alone', () => {
    startEditing(custom())
    resetPhoneLayout()
    const s = useEditorStore.getState()
    expect(s.draft!.stackOrder).toBeUndefined()
    expect(hideOn('a')).toEqual(['tablet'])
    expect(hideOn('b')).toBeUndefined()
    expect(hideOn('c')).toEqual(['desktop', 'phone'])
    expect(s.draft!.mdColumns).toBe(6)
    expect(s.draft!.widgets.every((w) => w.layout.md)).toBe(true)
    expect(s.undoStack).toHaveLength(1)
    undo()
    expect(useEditorStore.getState().draft!.stackOrder).toEqual(['c', 'b', 'a'])
  })
})

describe('a draft carried through the openHAB login page', () => {
  beforeEach(() => {
    session.clear()
    dropDraftKeptThroughSignIn()
    startEditing(board())
    updateDashboardMeta({ name: 'Edited' })
  })

  it('comes back once, for its own dashboard, and stands the unsaved-changes guard down meanwhile', () => {
    expect(keepDraftThroughSignIn()).toBe(true)
    expect(isLeavingForSignIn()).toBe(true)
    expect(takeDraftKeptThroughSignIn('other')).toBeNull()
    expect(takeDraftKeptThroughSignIn('d')?.name).toBe('Edited')
    expect(takeDraftKeptThroughSignIn('d')).toBeNull()
  })

  it('is dropped when the redirect never happened, and the guard is back', () => {
    keepDraftThroughSignIn()
    dropDraftKeptThroughSignIn()
    expect(isLeavingForSignIn()).toBe(false)
    expect(takeDraftKeptThroughSignIn('d')).toBeNull()
  })

  it('does not come back long after, or out of anything that is not a draft', () => {
    session.set('neohab:signinDraft', JSON.stringify({ at: Date.now() - 16 * 60_000, draft: board() }))
    expect(takeDraftKeptThroughSignIn('d')).toBeNull()
    session.set('neohab:signinDraft', '{not json')
    expect(takeDraftKeptThroughSignIn('d')).toBeNull()
    expect(session.has('neohab:signinDraft')).toBe(false)
  })

  it('says so when the browser will not keep it', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {}
    })
    try {
      expect(keepDraftThroughSignIn()).toBe(false)
      expect(isLeavingForSignIn()).toBe(false)
    } finally {
      vi.stubGlobal('sessionStorage', {
        getItem: (k: string) => session.get(k) ?? null,
        setItem: (k: string, v: string) => void session.set(k, v),
        removeItem: (k: string) => void session.delete(k)
      })
    }
  })
})
