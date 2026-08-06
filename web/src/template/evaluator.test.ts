/**
 * The Tier-1 expression sandbox.
 *
 * Custom widget templates run arbitrary user expressions. They are interpreted rather than
 * eval()'d, identifiers never fall through to globals, and the routes from any value to
 * `Function` are closed. The escape attempts below are the reason this file exists; the
 * AngularJS-compatibility cases are the reason imported HABPanel templates keep working.
 */
import { describe, expect, it } from 'vitest'
import { evaluate, type Scope } from './evaluator'

const scope = (extra: Scope = {}): Scope => Object.assign(Object.create(null) as Scope, extra)

describe('expressions', () => {
  it('evaluates the ordinary things a template does', () => {
    const s = scope({ a: 3, b: 4, name: 'kitchen', obj: { x: 1 }, list: [1, 2, 3] })
    expect(evaluate('a + b', s)).toBe(7)
    expect(evaluate('a * b - 2', s)).toBe(10)
    expect(evaluate('name + "!"', s)).toBe('kitchen!')
    expect(evaluate('obj.x', s)).toBe(1)
    expect(evaluate('list[1]', s)).toBe(2)
    expect(evaluate('a > b ? "big" : "small"', s)).toBe('small')
    expect(evaluate('!a', s)).toBe(false)
    expect(evaluate('-a', s)).toBe(-3)
  })

  it('keeps the loose equality AngularJS had, which HABPanel templates rely on', () => {
    const s = scope({ state: '1' })
    expect(evaluate('state == 1', s)).toBe(true)
    expect(evaluate('state === 1', s)).toBe(false)
    expect(evaluate('state != 2', s)).toBe(true)
  })

  it('is forgiving the way AngularJS was, rather than throwing', () => {
    const s = scope({ missing: undefined })
    expect(evaluate('nothing', s)).toBeUndefined()
    expect(evaluate('nothing.at.all', s)).toBeUndefined()
    expect(evaluate('missing.x', s)).toBeUndefined()
    expect(evaluate('(((', s)).toBeUndefined()
    expect(evaluate('', s)).toBeUndefined()
  })

  it('calls functions the scope exposes, with the right receiver', () => {
    const s = scope({
      itemState: (n: string) => (n === 'Lamp' ? '64' : ''),
      text: 'a,b,c',
    })
    expect(evaluate('itemState("Lamp")', s)).toBe('64')
    expect(evaluate('+itemState("Lamp") + 1', s)).toBe(65)
    expect(evaluate('text.split(",")', s)).toEqual(['a', 'b', 'c'])
    expect(evaluate('text.toUpperCase()', s)).toBe('A,B,C')
  })

  it('builds arrays and objects, and refuses dangerous keys in them', () => {
    const s = scope({ v: 2 })
    expect(evaluate('[1, v, 3]', s)).toEqual([1, 2, 3])
    expect(evaluate('{a: 1, b: v}', s)).toEqual({ a: 1, b: 2 })
    const built = evaluate('{__proto__: 1, ok: 2}', s) as Record<string, unknown>
    expect(built.ok).toBe(2)
    expect(Object.prototype.hasOwnProperty.call(built, '__proto__')).toBe(false)
  })
})

describe('assignment', () => {
  it('writes where the name already lives, so an ng-init accumulator adds up', () => {
    // `total = 0` on a wrapper and `total = total + x` inside a repeat must reach the same
    // variable, or every iteration writes to its own child scope and the total stays 0.
    const parent = scope({ total: 0 })
    const child: Scope = Object.create(parent)
    evaluate('total = total + 5', child)
    evaluate('total = total + 1', child)
    expect(parent.total).toBe(6)
  })

  it('creates an undeclared name locally', () => {
    const parent = scope({})
    const child: Scope = Object.create(parent)
    evaluate('fresh = 9', child)
    expect(Object.prototype.hasOwnProperty.call(child, 'fresh')).toBe(true)
    expect(parent.fresh).toBeUndefined()
  })

  it('runs several statements, answering with the last', () => {
    const s = scope({})
    expect(evaluate('a = 1; b = 2; a + b', s)).toBe(3)
  })
})

describe('the sandbox', () => {
  const s = scope({ text: 'hello', obj: { a: 1 }, list: [1, 2], fn: () => 1 })

  it('cannot reach a constructor by any route', () => {
    for (const attempt of [
      'constructor',
      'text.constructor',
      'obj.constructor',
      'list.constructor',
      'fn.constructor',
      'text["constructor"]',
      'text["con" + "structor"]',
      'obj.__proto__',
      'obj["__proto__"]',
      'list.__proto__.constructor',
      'text.constructor.constructor',
      'fn.prototype',
      'this.constructor',
    ]) {
      expect(evaluate(attempt, s), attempt).toBeUndefined()
    }
  })

  it('cannot reach globals', () => {
    for (const attempt of [
      'globalThis',
      'window',
      'process',
      'require("fs")',
      'eval("1+1")',
      'Function("return 1")()',
      'Object',
      'Array',
      'String',
      'JSON',
      'setTimeout',
      'fetch("/x")',
    ]) {
      expect(evaluate(attempt, s), attempt).toBeUndefined()
    }
  })

  it('cannot poison a prototype through assignment', () => {
    const target = scope({})
    evaluate('__proto__ = 1', target)
    evaluate('constructor = 1', target)
    expect(Object.getPrototypeOf(target)).toBeNull()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('resolves a bare identifier to undefined rather than an Object.prototype member', () => {
    // The scope root has a null prototype, so `toString` and friends are not reachable names.
    for (const name of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
      expect(evaluate(name, s), name).toBeUndefined()
    }
  })

  it('answers undefined for a call on something that is not a function', () => {
    expect(evaluate('text()', s)).toBeUndefined()
    expect(evaluate('obj.a()', s)).toBeUndefined()
  })
})
