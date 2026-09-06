import { describe, expect, it } from 'vitest'
import { emptyMap, lookup, mergeMap } from './lookup'

const HOSTILE = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', '__proto__', 'toLocaleString']

describe('lookup', () => {
  it('reads an own property', () => {
    expect(lookup({ a: 1 }, 'a')).toBe(1)
  })

  it('answers undefined for a missing key, whatever Object.prototype has under that name', () => {
    const table: Record<string, number> = { a: 1 }
    for (const key of HOSTILE) expect(lookup(table, key)).toBeUndefined()
  })

  it('still reads a hostile name that is genuinely in the table', () => {
    const table: Record<string, number> = { constructor: 7, toString: 8 }
    expect(lookup(table, 'constructor')).toBe(7)
    expect(lookup(table, 'toString')).toBe(8)
  })

  it('answers undefined for a key that is not a string', () => {
    expect(lookup({ a: 1 }, undefined)).toBeUndefined()
    expect(lookup({ a: 1 }, null)).toBeUndefined()
  })
})

describe('emptyMap', () => {
  it('has no prototype, so a bare index cannot find one', () => {
    const m = emptyMap<number>()
    expect(Object.getPrototypeOf(m)).toBeNull()
    for (const key of HOSTILE) expect(m[key]).toBeUndefined()
  })

  it('reports nothing as present, by `in` as well as by index', () => {
    const m = emptyMap<number>()
    for (const key of HOSTILE) expect(key in m).toBe(false)
  })
})

describe('mergeMap', () => {
  it('merges left to right, later wins', () => {
    expect({ ...mergeMap<number>({ a: 1, b: 2 }, { b: 3, c: 4 }) }).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('keeps the result prototype-free', () => {
    const m = mergeMap<number>({ a: 1 }, { b: 2 })
    expect(Object.getPrototypeOf(m)).toBeNull()
    for (const key of HOSTILE) expect(m[key]).toBeUndefined()
  })

  it('stores an item literally named __proto__ as data, and pollutes nothing', () => {
    const delta = JSON.parse('{"__proto__": {"polluted": true}}') as Record<string, unknown>
    const m = mergeMap<unknown>(emptyMap(), delta)
    expect(m['__proto__']).toEqual({ polluted: true })
    expect(Object.getPrototypeOf(m)).toBeNull()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('ignores nothing, so a name that shadows a prototype member round-trips', () => {
    const m = mergeMap<string>(emptyMap(), { constructor: 'ON', toString: 'OFF' })
    expect(m['constructor']).toBe('ON')
    expect(m['toString']).toBe('OFF')
    expect(Object.keys(m).sort()).toEqual(['constructor', 'toString'])
  })
})
