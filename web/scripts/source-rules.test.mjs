// three mechanical rules over the source itself, each one a bug class this project has hit more than once
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
}

const FILES = sources(src)
const CODE = new Map(FILES.map((path) => [path, withoutComments(readFileSync(path, 'utf8'))]))
const rel = (path) => relative(src, path).split('\\').join('/')

describe('the source scan itself', () => {
  it('has sources to scan, so an empty pass cannot look like a clean one', () => {
    expect(FILES.length).toBeGreaterThan(100)
  })
})

// Every binding whose DECLARED type says any string key is acceptable. The first version of this
// matched top-level `const` only, which left 63 declarations invisible - every zustand store-state
// map among them, since those are interface fields, and that is how store/dragging.ts shipped a bare
// `endedAt[item]`. A parameter is left out (its map was built by the caller) and so is a return type,
// which names no binding to read.
const OPEN_TABLE =
  /^[ \t]*(?:export[ \t]+)?(?:const[ \t]+|let[ \t]+|var[ \t]+|readonly[ \t]+)?([A-Za-z_$][\w$]*)\??[ \t]*:[ \t]*(?:Partial<|Readonly<)?Record<\s*string\s*,/gm
// only what a module exports can be read by name from another file, and FILTERS is declared in
// template/filters.ts and read in template/engine.ts - a same-file scan would miss exactly that read
const EXPORTED_TABLE = /^export[ \t]+(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*:[ \t]*(?:Partial<|Readonly<)?Record<\s*string\s*,/gm
// a key this code did not choose: not a literal, and not an array index
const CHOSEN_KEY = /^(?:['"`].*|[-+\d\s.*/()]*|[\w.$]+\.length(?:\s*[-+]\s*\d+)?)$/
// prototype-free by construction (model/lookup), which is what makes a bare index safe at every read,
// including the ones written later
const PROTO_FREE = /^(?:emptyMap|mergeMap)\s*[<(]|^Object\.create\(null\)/

// guarded at the read instead: every key is refused by FORBIDDEN_PROPS first, and the objects a
// template builds must keep an ordinary prototype
const TABLE_ALLOWED = new Set([
  'template/evaluator.ts out[key]',
  // the keys are the table's own, from Object.keys(PERIODS)
  'widgets/chart/model.ts PERIODS[a]',
  'widgets/chart/model.ts PERIODS[b]'
])

const tablesIn = (text, re) => new Set([...text.matchAll(re)].map((m) => m[1]))

// what the name is set to, with any type annotation between the name and the `=` dropped
function initialisersOf(text, name) {
  const out = []
  for (const m of text.matchAll(new RegExp('\\b' + name + '\\s*[:=]([^\\n]*)', 'g'))) {
    const tail = m[1]
    const assign = /(^|[^=!<>])=(?!=)/.exec(tail)
    out.push((assign ? tail.slice(assign.index + assign[0].length) : tail).trim())
  }
  return out
}

function bareIndexOffenders(code) {
  const exported = new Set()
  for (const text of code.values()) for (const name of tablesIn(text, EXPORTED_TABLE)) exported.add(name)
  const offenders = []
  for (const [path, text] of code) {
    for (const name of new Set([...tablesIn(text, OPEN_TABLE), ...exported])) {
      const reads = new RegExp('(?:^|[^\\w$])(?:[\\w$]+\\??\\.)?' + name + '\\[([^\\]]*)\\]', 'g')
      for (const m of text.matchAll(reads)) {
        if (CHOSEN_KEY.test(m[1].trim())) continue
        const inits = initialisersOf(text, name)
        if (inits.some((i) => PROTO_FREE.test(i)) && !inits.some((i) => i.startsWith('{'))) continue
        offenders.push(path + ' ' + name + '[' + m[1] + ']')
      }
    }
  }
  return offenders
}

describe('tables indexed by a key this code did not choose', () => {
  const openTables = () => {
    const tables = new Set()
    for (const text of CODE.values()) for (const name of tablesIn(text, OPEN_TABLE)) tables.add(name)
    return tables
  }

  it('finds the open tables it exists to police, in every spelling they are declared in', () => {
    const tables = openTables()
    expect(tables.has('FILTERS')).toBe(true) // exported top-level const
    expect(tables.has('PERIODS')).toBe(true)
    expect(tables.has('endedAt')).toBe(true) // a store-state interface field
    expect(tables.has('pending')).toBe(true)
    expect(tables.has('full')).toBe(true)
    expect(tables.has('out')).toBe(true) // an indented const inside a function
    expect(tables.size).toBeGreaterThan(30)
  })

  it('builds every such table prototype-free, or records why a bare index is safe', () => {
    const offenders = bareIndexOffenders(new Map([...CODE].map(([p, t]) => [rel(p), t]))).filter((e) => !TABLE_ALLOWED.has(e))
    expect(offenders).toEqual([])
  })

  // a rule that has never failed proves nothing, and this one is only worth keeping if it tells the
  // two constructions apart rather than flagging every bare index
  it('flags a map built from an object literal and clears the same map built with emptyMap', () => {
    const literal = `
interface DraggingState {
  endedAt: Record<string, number>
}
export const useDraggingStore = create<DraggingState>(() => ({ endedAt: {} }))
export function useDragEndedAt(item: string) {
  return useDraggingStore((s) => s.endedAt[item])
}`
    const guarded = literal.replace('endedAt: {}', 'endedAt: emptyMap()')
    expect(bareIndexOffenders(new Map([['x.ts', literal]]))).toEqual(['x.ts endedAt[item]'])
    expect(bareIndexOffenders(new Map([['x.ts', guarded]]))).toEqual([])
  })

  it('still flags a bare read of a literal table, and never flags an array index', () => {
    const table = `
export const CONVERTERS: Record<string, () => void> = { a: () => {} }
export function run(type: string) { CONVERTERS[type]() }`
    expect(bareIndexOffenders(new Map([['x.ts', table]]))).toEqual(['x.ts CONVERTERS[type]'])
    const rows = `
const rows: Record<string, number[]> = {}
export const a = rows['x'][0]
export const b = rows['x'][i + 1]
export const c = rows['x'][rows['x'].length - 1]`
    expect(bareIndexOffenders(new Map([['x.ts', rows]]))).toEqual([])
  })
})

describe('history fetches', () => {
  const CALLS = /(getItemHistory\(|loadChartData\()/g

  it('finds the call sites it exists to police', () => {
    let count = 0
    for (const text of CODE.values()) count += [...text.matchAll(CALLS)].length
    expect(count).toBeGreaterThanOrEqual(6)
  })

  it('pass a signal, so leaving the screen stops the download', () => {
    const offenders = []
    for (const [path, text] of CODE) {
      if (/api\/persistence\.ts$|chart\/data\.ts$/.test(rel(path))) continue
      for (const m of text.matchAll(CALLS)) {
        let depth = 0
        let end = m.index + m[0].length - 1
        for (; end < text.length; end++) {
          if (text[end] === '(') depth++
          else if (text[end] === ')' && --depth === 0) break
        }
        const args = text.slice(m.index, end + 1)
        if (!/\bsignal\s*:/.test(args)) offenders.push(rel(path) + ' ' + m[1].replace('(', ''))
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('maps keyed by item names', () => {
  it('are not rebuilt with Object.fromEntries, which restores the prototype', () => {
    const offenders = []
    for (const [path, text] of CODE) {
      for (const m of text.matchAll(/Object\.fromEntries\([^\n]*/g)) {
        if (/\.states\[/.test(m[0])) offenders.push(rel(path) + ': ' + m[0].trim().slice(0, 72))
      }
    }
    expect(offenders).toEqual([])
  })
})
