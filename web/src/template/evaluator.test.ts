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
      text: 'a,b,c'
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
      'this.constructor'
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
      'fetch("/x")'
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
    for (const name of ['toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']) {
      expect(evaluate(name, s), name).toBeUndefined()
    }
  })

  it('cannot reach a constructor by a computed or disguised key', () => {
    const s2 = scope({ text: 'x', obj: { a: 1 }, list: [1], fn: () => 1 })
    for (const expr of [
      'obj["const" + "ructor"]',
      'obj[["cons", "tructor"].join("")]',
      'obj?.constructor',
      'obj?.["constructor"]',
      'text?.constructor?.constructor',
      'obj[`constructor`]',
      'list["const" + "ructor"]',
      'fn["constr" + "uctor"]'
    ]) {
      expect(evaluate(expr, s2), expr).toBeUndefined()
    }
  })

  it('does not let a function be re-pointed at the host', () => {
    const s2 = scope({
      fn: function (this: unknown) {
        return this
      },
      obj: { a: 1 }
    })
    for (const expr of ['fn.call(obj)', 'fn.bind(obj)()', 'fn.apply(obj)', 'fn.constructor("return globalThis")()']) {
      const out = evaluate(expr, s2)
      expect(out === globalThis, expr).toBe(false)
      expect(typeof out === 'object' && out !== null && 'process' in (out as object), expr).toBe(false)
    }
  })

  it('exposes no ambient names a script would expect', () => {
    const s2 = scope({})
    for (const name of [
      'arguments',
      'Symbol',
      'Reflect',
      'Proxy',
      'Object',
      'Array',
      'JSON',
      'Math',
      'setTimeout',
      'fetch',
      'document',
      'location',
      'self',
      'top',
      'parent',
      'localStorage'
    ]) {
      expect(evaluate(name, s2), name).toBeUndefined()
    }
  })

  it('cannot assign its way onto Object.prototype through a computed key', () => {
    const target = scope({ obj: {} })
    evaluate('obj["__pro" + "to__"] = {polluted: 1}', target)
    evaluate('obj.__proto__.polluted = 1', target)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('answers undefined for a call on something that is not a function', () => {
    expect(evaluate('text()', s)).toBeUndefined()
    expect(evaluate('obj.a()', s)).toBeUndefined()
  })

  it('cannot reach Object.prototype through __lookupGetter__ and a function call', () => {
    expect(evaluate("''.__lookupGetter__('__proto__').call({})", s)).toBeUndefined()
    expect(evaluate("text.__lookupGetter__('__proto__')", s)).toBeUndefined()
    expect(evaluate("obj.__defineGetter__('x', fn)", s)).toBeUndefined()
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })

  it('hands out no member of Object.prototype or Function.prototype, on any kind of value', () => {
    const scope2 = scope({ text: 'hello', obj: { a: 1 }, list: [1, 2], fn: () => 1, n: 5, yes: true })
    const members = [...Object.getOwnPropertyNames(Object.prototype), ...Object.getOwnPropertyNames(Function.prototype)]
    const leaked: string[] = []
    for (const receiver of ['text', 'obj', 'list', 'fn', 'n', 'yes', 'this']) {
      for (const name of members) {
        for (const expr of [`${receiver}.${name}`, `${receiver}["${name}"]`]) {
          const out = evaluate(expr, scope2)
          if (out === undefined) continue
          const own = (Object.prototype as unknown as Record<string, unknown>)[name]
          const fnOwn = (Function.prototype as unknown as Record<string, unknown>)[name]
          if (out === own || out === fnOwn || out === Object.prototype || out === Function.prototype) leaked.push(expr)
        }
      }
    }
    expect(leaked).toEqual([])
  })

  it('gives a function no members at all, so call, apply and bind are out of reach', () => {
    for (const expr of ['fn.call', 'fn.apply', 'fn.bind', 'fn.name', 'fn.length', 'fn.toString'])
      expect(evaluate(expr, s), expr).toBeUndefined()
  })

  it('still offers what templates read and call', () => {
    const s2 = scope({ text: 'a,b', list: ['x', 'y'], n: 3.14159, item: { state: 'ON', label: 'Lamp' } })
    expect(evaluate('text.length', s2)).toBe(3)
    expect(evaluate('text.split(",").join("-")', s2)).toBe('a-b')
    expect(evaluate('text.toUpperCase()', s2)).toBe('A,B')
    expect(evaluate('list.length', s2)).toBe(2)
    expect(evaluate('list.indexOf("y")', s2)).toBe(1)
    expect(evaluate('list[0]', s2)).toBe('x')
    expect(evaluate('n.toFixed(2)', s2)).toBe('3.14')
    expect(evaluate('item.state', s2)).toBe('ON')
    expect(evaluate('text[0]', s2)).toBe('a')
  })

  it('reads a name a child scope inherits from its parent scope, as ng-repeat nests them', () => {
    const parent = scope({ config: { title: 'x' } })
    const child: Scope = Object.create(parent)
    child.row = 1
    expect(evaluate('this.config.title', child)).toBe('x')
    expect(evaluate('this.row', child)).toBe(1)
  })

  it('does not let a template sort or empty a list it was handed', () => {
    const list = [3, 1, 2]
    const s2 = scope({ list })
    for (const expr of ['list.sort()', 'list.reverse()', 'list.pop()', 'list.push(9)', 'list.splice(0)', 'list.fill(0)']) evaluate(expr, s2)
    expect(list).toEqual([3, 1, 2])
  })
})
