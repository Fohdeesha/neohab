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

  it('passes the value through for a filter named after an Object.prototype member', () => {
    for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf']) {
      expect(() => evalWithFilters(`x | ${name}`, scope())).not.toThrow()
      expect(evalWithFilters(`x | ${name}`, scope())).toBe('Hello')
    }
  })
})
