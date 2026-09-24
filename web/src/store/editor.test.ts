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
