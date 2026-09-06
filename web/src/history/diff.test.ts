import { describe, expect, it } from 'vitest'
import type { SnapshotEntry } from '../model/history'
import { deepEqual, diffEntries, diffValues, formatValue, MAX_FIELDS, type FieldChange } from './diff'

const entry = (uid: string, config: Record<string, unknown>, extra: Partial<SnapshotEntry> = {}): SnapshotEntry => ({
  uid,
  component: 'neohab:dashboard',
  config,
  ...extra
})

const paths = (before: unknown, after: unknown): string[] => {
  const out: FieldChange[] = []
  diffValues(before, after, '', out)
  return out.map((c) => c.path)
}

describe('deepEqual', () => {
  it('compares structures, not references', () => {
    expect(deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual(null, undefined)).toBe(false)
    expect(deepEqual(0, '0')).toBe(false)
  })
})

describe('diffValues', () => {
  it('names the field that changed, not the whole object', () => {
    expect(paths({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b'])
    expect(paths({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toEqual(['a.b.c'])
  })

  it('reports added and removed keys as such', () => {
    const out: FieldChange[] = []
    diffValues({ a: 1 }, { b: 2 }, '', out)
    expect(out.map((c) => [c.path, c.kind])).toEqual([
      ['a', 'removed'],
      ['b', 'added']
    ])
  })

  it('matches keyed arrays by id, so moving a widget is not "every widget changed"', () => {
    const before = {
      widgets: [
        { id: 'w1', config: { label: 'A' } },
        { id: 'w2', config: { label: 'B' } }
      ]
    }
    const after = {
      widgets: [
        { id: 'w2', config: { label: 'B' } },
        { id: 'w1', config: { label: 'A' } }
      ]
    }
    expect(paths(before, after)).toEqual([])
  })

  it('labels a keyed element by the name a reader would know it by', () => {
    const before = { widgets: [{ id: 'w1', config: { label: 'Kitchen lamp', icon: 'a' } }] }
    const after = { widgets: [{ id: 'w1', config: { label: 'Kitchen lamp', icon: 'b' } }] }
    expect(paths(before, after)).toEqual(['widgets[Kitchen lamp].config.icon'])
  })

  it('falls back to positions for an array without ids', () => {
    expect(paths({ xs: [1, 2, 3] }, { xs: [1, 9, 3] })).toEqual(['xs[1]'])
  })

  it('stops at the limit rather than listing thousands of changes', () => {
    const before: Record<string, number> = {}
    const after: Record<string, number> = {}
    for (let i = 0; i < MAX_FIELDS * 2; i++) {
      before['k' + i] = i
      after['k' + i] = i + 1
    }
    const out: FieldChange[] = []
    diffValues(before, after, '', out)
    expect(out).toHaveLength(MAX_FIELDS)
  })
})

describe('diffEntries', () => {
  it('reports one row per component that is not identical', () => {
    const before = [entry('dashboard:a', { name: 'A' }), entry('dashboard:b', { name: 'B' })]
    const after = [entry('dashboard:a', { name: 'A2' }), entry('dashboard:c', { name: 'C' })]
    const rows = diffEntries(before, after)
    expect(rows.map((r) => [r.uid, r.kind])).toEqual([
      ['dashboard:a', 'changed'],
      ['dashboard:c', 'added'],
      ['dashboard:b', 'removed']
    ])
  })

  it('says an image changed without loading either of them', () => {
    const before = [entry('icon:x', { name: 'x' }, { blobHash: 'aaa' })]
    const after = [entry('icon:x', { name: 'x' }, { blobHash: 'bbb' })]
    const [row] = diffEntries(before, after)
    expect(row.fields[0].path).toBe('image')
    expect(row.fields[0].before).toBe('aaa')
  })

  it('sees no change where there is none', () => {
    const same = [entry('dashboard:a', { name: 'A', widgets: [{ id: 'w', config: {} }] })]
    expect(diffEntries(same, structuredClone(same))).toEqual([])
  })

  it('notices a tag change', () => {
    const before = [entry('dashboard:a', { name: 'A' }, { tags: ['x'] })]
    const after = [entry('dashboard:a', { name: 'A' }, { tags: ['y'] })]
    expect(diffEntries(before, after)[0].fields[0].path).toBe('tags')
  })
})

describe('formatValue', () => {
  it('renders a value short and safe', () => {
    expect(formatValue(undefined)).toBe('-')
    expect(formatValue(null)).toBe('null')
    expect(formatValue('hi')).toBe('hi')
    expect(formatValue({ a: 1 })).toBe('{"a":1}')
    expect(formatValue('x'.repeat(500))).toHaveLength(121)
  })

  it('survives a value that cannot be serialised', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => formatValue(cyclic)).not.toThrow()
  })
})
