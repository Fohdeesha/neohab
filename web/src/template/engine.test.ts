/**
 * The template engine's filter pipeline.
 *
 * A filter name comes from the template author, who is not necessarily the person running the
 * dashboard: a widget definition arrives through an import, a backup or the gallery.
 */
import { describe, expect, it } from 'vitest'
import { evalWithFilters } from './engine'

const scope = () => Object.assign(Object.create(null), { x: 'Hello', n: 3.14159 })

describe('evalWithFilters', () => {
  it('applies a filter', () => {
    expect(evalWithFilters('x | uppercase', scope())).toBe('HELLO')
    expect(evalWithFilters('n | number:2', scope())).toBe('3.14')
  })

  it('passes the value through untouched when the filter does not exist', () => {
    expect(evalWithFilters('x | nosuchfilter', scope())).toBe('Hello')
  })

  /*
   * A bare `FILTERS[name]` finds an Object.prototype member, and `if (!filter) continue` does not
   * fire for a function - so `Object(value)` was called as a filter, and `| __proto__` threw
   * "filter is not a function" out through the interpolation.
   */
  it('passes the value through for a filter named after an Object.prototype member', () => {
    for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf']) {
      expect(() => evalWithFilters(`x | ${name}`, scope())).not.toThrow()
      expect(evalWithFilters(`x | ${name}`, scope())).toBe('Hello')
    }
  })
})
