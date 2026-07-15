/**
 * Safe expression evaluator for Tier-1 template widgets.
 *
 * Expressions are parsed by jsep into an AST and interpreted here - no eval()/Function().
 * The evaluator is deliberately forgiving like AngularJS was (HABPanel templates rely on it):
 * missing identifiers and member access on null/undefined yield undefined instead of throwing,
 * and any runtime error inside an expression resolves to undefined.
 *
 * Security model: expressions can only reach values placed in the scope (helpers, config,
 * template-local variables). Identifier lookup never falls through to globals, and access to
 * `__proto__` / `prototype` / `constructor` is blocked so an expression cannot climb from a
 * scope value to Function and arbitrary code.
 */
import jsep from 'jsep'
import jsepObject from '@jsep-plugin/object'
import jsepAssignment from '@jsep-plugin/assignment'

jsep.plugins.register(jsepObject, jsepAssignment)

/** Template scope: prototype-chained objects so child scopes (x-for) shadow their parents. */
export type Scope = Record<string, unknown>

const FORBIDDEN_PROPS = new Set(['__proto__', 'prototype', 'constructor'])

const parseCache = new Map<string, jsep.Expression | Error>()

export function parseExpression(src: string): jsep.Expression | Error {
  let ast = parseCache.get(src)
  if (!ast) {
    try {
      ast = jsep(src)
    } catch (err) {
      ast = err instanceof Error ? err : new Error(String(err))
    }
    if (parseCache.size > 500) parseCache.clear()
    parseCache.set(src, ast)
  }
  return ast
}

/** Evaluate an expression string against a scope. Errors resolve to undefined. */
export function evaluate(src: string, scope: Scope): unknown {
  const ast = parseExpression(src.trim())
  if (ast instanceof Error) return undefined
  try {
    return evalNode(ast, scope)
  } catch {
    return undefined
  }
}

type AnyNode = jsep.Expression & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function evalNode(node: jsep.Expression, scope: Scope): unknown {
  const n = node as AnyNode
  switch (n.type) {
    case 'Literal':
      return n.value
    case 'Identifier':
      return scope[n.name as string]
    case 'ThisExpression':
      return scope
    case 'MemberExpression': {
      const { value } = evalMember(n, scope)
      return value
    }
    case 'CallExpression': {
      const callee = n.callee as AnyNode
      let thisObj: unknown
      let fn: unknown
      if (callee.type === 'MemberExpression') {
        const m = evalMember(callee, scope)
        thisObj = m.object
        fn = m.value
      } else {
        fn = evalNode(callee, scope)
      }
      if (typeof fn !== 'function') return undefined
      const args = (n.arguments as jsep.Expression[]).map((a) => evalNode(a, scope))
      return Reflect.apply(fn, thisObj, args)
    }
    case 'UnaryExpression': {
      const v = evalNode(n.argument as jsep.Expression, scope)
      switch (n.operator) {
        case '+':
          return +Number(v as number)
        case '-':
          return -Number(v as number)
        case '!':
          return !v
        case '~':
          return ~Number(v as number)
        default:
          return undefined
      }
    }
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const op = n.operator as string
      if (op === '&&') return evalNode(n.left as jsep.Expression, scope) && evalNode(n.right as jsep.Expression, scope)
      if (op === '||') return evalNode(n.left as jsep.Expression, scope) || evalNode(n.right as jsep.Expression, scope)
      if (op === '??') {
        const l = evalNode(n.left as jsep.Expression, scope)
        return l ?? evalNode(n.right as jsep.Expression, scope)
      }
      return binary(op, evalNode(n.left as jsep.Expression, scope), evalNode(n.right as jsep.Expression, scope))
    }
    case 'ConditionalExpression':
      return evalNode(n.test as jsep.Expression, scope)
        ? evalNode(n.consequent as jsep.Expression, scope)
        : evalNode(n.alternate as jsep.Expression, scope)
    case 'ArrayExpression':
      return (n.elements as jsep.Expression[]).map((e) => (e ? evalNode(e, scope) : undefined))
    case 'ObjectExpression': {
      const out: Record<string, unknown> = {}
      for (const p of n.properties as AnyNode[]) {
        const key = p.computed
          ? String(evalNode(p.key as jsep.Expression, scope))
          : String((p.key as AnyNode).name ?? (p.key as AnyNode).value)
        if (FORBIDDEN_PROPS.has(key)) continue
        out[key] = p.shorthand ? scope[key] : evalNode(p.value as jsep.Expression, scope)
      }
      return out
    }
    case 'AssignmentExpression': {
      if (n.operator !== '=') return undefined
      const left = n.left as AnyNode
      const value = evalNode(n.right as jsep.Expression, scope)
      // Assignments only ever write template-scope variables, never members of exposed objects.
      if (left.type === 'Identifier' && !FORBIDDEN_PROPS.has(left.name as string)) {
        assign(scope, left.name as string, value)
      }
      return value
    }
    case 'Compound':
    case 'SequenceExpression': {
      const body = (n.body ?? n.expressions) as jsep.Expression[]
      let last: unknown
      for (const e of body) last = evalNode(e, scope)
      return last
    }
    default:
      return undefined
  }
}

/**
 * Write a scope variable where it already lives, like AngularJS did: a name defined on a parent
 * scope is updated there, so `ng-init="total = 0"` on a wrapper and `total = total + x` inside an
 * ng-repeat accumulate into the same variable instead of the assignment landing on the loop's own
 * child scope and vanishing with each iteration. An undeclared name is created locally.
 */
function assign(scope: Scope, name: string, value: unknown): void {
  let target: object | null = scope
  while (target) {
    if (Object.prototype.hasOwnProperty.call(target, name)) {
      ;(target as Scope)[name] = value
      return
    }
    target = Object.getPrototypeOf(target) as object | null
  }
  scope[name] = value
}

function evalMember(n: AnyNode, scope: Scope): { object: unknown; value: unknown } {
  const object = evalNode(n.object as jsep.Expression, scope)
  if (object === null || object === undefined) return { object, value: undefined }
  const key = n.computed
    ? String(evalNode(n.property as jsep.Expression, scope))
    : String((n.property as AnyNode).name)
  if (FORBIDDEN_PROPS.has(key)) return { object, value: undefined }
  return { object, value: (object as Record<string, unknown>)[key] }
}

function binary(op: string, l: unknown, r: unknown): unknown {
  const a = l as number
  const b = r as number
  switch (op) {
    case '+':
      // JS semantics on purpose: number addition or string concatenation
      return (l as never) + (r as never)
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return a / b
    case '%':
      return a % b
    case '==':
      // eslint-disable-next-line eqeqeq
      return l == r
    case '!=':
      // eslint-disable-next-line eqeqeq
      return l != r
    case '===':
      return l === r
    case '!==':
      return l !== r
    case '<':
      return a < b
    case '<=':
      return a <= b
    case '>':
      return a > b
    case '>=':
      return a >= b
    default:
      return undefined
  }
}
