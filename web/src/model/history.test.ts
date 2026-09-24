import { describe, expect, it } from 'vitest'
import {
  applyRetention,
  clampLimit,
  clampWindow,
  DEFAULT_HISTORY_LIMIT,
  DEFAULT_HISTORY_WINDOW_MIN,
  entryCategory,
  entryName,
  extractBlob,
  historyEnabled,
  MAX_HISTORY_LIMIT,
  mergeIndexes,
  shouldCapture,
  toEntry,
  unnamedCount,
  type HistoryIndex,
  type SnapshotEntry,
  type SnapshotMeta,
  unusedBlobs,
  withBlob
} from './history'

const meta = (id: string, blobs: string[] = []): SnapshotMeta => ({
  id,
  createdAt: '2026-08-04T00:00:00Z',
  summary: { count: 0, names: [] },
  entries: 1,
  blobs
})

describe('capture policy', () => {
  const base = { limit: 25, windowMin: 5, haveSnapshots: true, now: 1_000_000 }

  it('captures the first time, whatever the window says', () => {
    expect(shouldCapture({ ...base, haveSnapshots: false, lastWriteAt: base.now })).toBe(true)
  })

  it('coalesces writes inside the window into one restore point', () => {
    expect(shouldCapture({ ...base, lastWriteAt: base.now - 60_000 })).toBe(false)
    expect(shouldCapture({ ...base, lastWriteAt: base.now - 6 * 60_000 })).toBe(true)
  })

  it('captures when this device has never seen a write', () => {
    expect(shouldCapture({ ...base, lastWriteAt: null })).toBe(true)
  })

  it('captures nothing at all when the history is off', () => {
    expect(shouldCapture({ ...base, limit: 0, lastWriteAt: null })).toBe(false)
    expect(historyEnabled(0)).toBe(false)
    expect(historyEnabled(1)).toBe(true)
  })
})

describe('clamping user input', () => {
  it('keeps a retention count storable', () => {
    expect(clampLimit(50)).toBe(50)
    expect(clampLimit(-5)).toBe(0)
    expect(clampLimit(99_999)).toBe(MAX_HISTORY_LIMIT)
    expect(clampLimit(NaN)).toBe(DEFAULT_HISTORY_LIMIT)
    expect(clampLimit(7.6)).toBe(8)
  })

  it('keeps a coalescing window storable', () => {
    expect(clampWindow(30)).toBe(30)
    expect(clampWindow(-1)).toBe(0)
    expect(clampWindow(999_999)).toBe(1440)
    expect(clampWindow(NaN)).toBe(DEFAULT_HISTORY_WINDOW_MIN)
  })
})

describe('retention', () => {
  it('keeps the newest and reports what falls off', () => {
    const list = [meta('5'), meta('4'), meta('3'), meta('2'), meta('1')]
    const { keep, drop } = applyRetention(list, 3)
    expect(keep.map((s) => s.id)).toEqual(['5', '4', '3'])
    expect(drop.map((s) => s.id)).toEqual(['2', '1'])
  })

  it('drops every unnamed point when the history is turned off', () => {
    const { keep, drop } = applyRetention([meta('1')], 0)
    expect(keep).toEqual([])
    expect(drop).toHaveLength(1)
  })

  it('never drops a point somebody named, and does not count it against the limit', () => {
    const named = (id: string, label: string) => ({ ...meta(id), label })
    const list = [meta('6'), named('5', 'before the move'), meta('4'), meta('3'), named('2', '  '), named('1', 'first')]
    const { keep, drop } = applyRetention(list, 2)
    expect(keep.map((s) => s.id)).toEqual(['6', '5', '4', '1'])
    expect(drop.map((s) => s.id)).toEqual(['3', '2'])
    expect(applyRetention(list, 0).keep.map((s) => s.id)).toEqual(['5', '1'])
    expect(unnamedCount(list)).toBe(4)
  })
})

describe('shared image bodies', () => {
  it('splits a body off an entry and puts it back unchanged', () => {
    const e: SnapshotEntry = { uid: 'icon:x', component: 'neohab:icon', config: { id: 'x', dataUri: 'data:,PAYLOAD' } }
    const body = extractBlob(e)
    expect(body).toBe('data:,PAYLOAD')
    expect(e.config.dataUri).toBeUndefined()
    expect(withBlob(e, body!).config.dataUri).toBe('data:,PAYLOAD')
  })

  it('leaves an entry with no image alone', () => {
    const e: SnapshotEntry = { uid: 'dashboard:a', component: 'neohab:dashboard', config: { name: 'A' } }
    expect(extractBlob(e)).toBeNull()
    expect(e.config).toEqual({ name: 'A' })
  })

  it('collects only the bodies no snapshot still references', () => {
    const index: HistoryIndex = {
      version: 1,
      snapshots: [meta('2', ['keep']), meta('1', ['keep'])],
      blobs: ['keep', 'orphan']
    }
    expect(unusedBlobs(index)).toEqual(['orphan'])
  })
})

describe('entries', () => {
  it('drops the fields openHAB adds on every read', () => {
    const e = toEntry({
      uid: 'dashboard:a',
      component: 'neohab:dashboard',
      config: { name: 'A' },
      timestamp: 'Aug 4, 2026',
      props: { parameters: [] }
    })
    expect(e).toEqual({ uid: 'dashboard:a', component: 'neohab:dashboard', config: { name: 'A' } })
  })

  it('keeps tags only when there are some', () => {
    expect(toEntry({ uid: 'a', component: 'c', tags: [] }).tags).toBeUndefined()
    expect(toEntry({ uid: 'a', component: 'c', tags: ['x'] }).tags).toEqual(['x'])
  })

  it('names an entry the way a reader would recognise it', () => {
    expect(entryName({ uid: 'dashboard:a', component: 'c', config: { name: 'Kitchen' } })).toBe('Kitchen')
    expect(entryName({ uid: 'dashboard:a', component: 'c', config: { id: 'a' } })).toBe('a')
    expect(entryName({ uid: 'settings', component: 'c', config: {} })).toBe('settings')
  })

  it('groups by the uid prefix', () => {
    expect(entryCategory('dashboard:kitchen')).toBe('dashboard')
    expect(entryCategory('settings')).toBe('settings')
  })
})

describe('mergeIndexes', () => {
  const meta = (id: string) => ({
    id,
    createdAt: new Date(Number(id)).toISOString(),
    summary: { count: 0, names: [] },
    entries: 1,
    blobs: []
  })

  it('keeps snapshots another writer added while ours was in flight', () => {
    const mine = { version: 1, snapshots: [meta('300'), meta('100')], blobs: ['a'] }
    const theirs = { version: 1, snapshots: [meta('200'), meta('100')], blobs: ['b'] }
    const merged = mergeIndexes(mine, theirs)
    expect(merged.snapshots.map((s) => s.id)).toEqual(['300', '200', '100'])
    expect([...merged.blobs].sort()).toEqual(['a', 'b'])
  })

  it('lists each snapshot once, preferring our own copy of it', () => {
    const mine = { version: 1, snapshots: [{ ...meta('100'), entries: 9 }], blobs: [] }
    const theirs = { version: 1, snapshots: [{ ...meta('100'), entries: 1 }], blobs: [] }
    const merged = mergeIndexes(mine, theirs)
    expect(merged.snapshots).toHaveLength(1)
    expect(merged.snapshots[0].entries).toBe(9)
  })

  it('orders newest first, whatever order either side was in', () => {
    const mine = { version: 1, snapshots: [meta('100'), meta('500')], blobs: [] }
    const theirs = { version: 1, snapshots: [meta('300')], blobs: [] }
    expect(mergeIndexes(mine, theirs).snapshots.map((s) => s.id)).toEqual(['500', '300', '100'])
  })

  it('survives an index that is missing its lists', () => {
    const broken = {} as never
    expect(mergeIndexes({ version: 1, snapshots: [meta('100')], blobs: [] }, broken).snapshots).toHaveLength(1)
    expect(mergeIndexes(broken, { version: 1, snapshots: [meta('100')], blobs: [] }).snapshots).toHaveLength(1)
  })
})
