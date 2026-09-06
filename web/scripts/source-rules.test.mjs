/**
 * Mechanical rules over the source itself.
 *
 * Each of these encodes a mistake this project has actually made more than once, in a form a
 * scan can see. They exist because the pattern in every audit so far has been the same: the rule
 * was right, the fix to the reported instance was right, and the sweep for the OTHER instances
 * was incomplete - so the same bug came back somewhere else weeks later. A rule that only lives
 * in a comment is a rule nobody is checking.
 *
 * Keep them precise rather than broad. A noisy check gets an allow-list entry per failure and
 * stops meaning anything; each rule below is drawn at the exact line where the mistake is
 * possible, so a clean run is evidence and not luck.
 */
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

/**
 * Comments blanked, so prose ABOUT a mistake does not read as the mistake. The first run of the
 * table rule reported `PERIODS[period]` out of the comment explaining why that read goes through
 * `lookup`. Blanked rather than deleted, so offsets still line up with the file.
 */
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

/* ------------------------------------------------------------------ *
 * Tables indexed by a key this code did not choose
 * ------------------------------------------------------------------ */

/**
 * `TABLE[key]` walks the prototype chain, so a key this code did not choose - an item name, a
 * semantic tag, a stored period, a filter name written by whoever authored a template - finds a
 * function or an object on `Object.prototype` instead of missing. That is not nullish, so a
 * trailing `?? fallback` never fires and the value travels on as if it were real.
 *
 * `model/lookup.ts` records five instances across two modules in two months. An audit later
 * found five more, in five different modules, that the sweep after those fixes never reached,
 * and writing this rule turned up a sixth in the language loader.
 *
 * The line is drawn at the DECLARATION: `Record<string, ...>` says in its own type that any key
 * is acceptable, which is exactly the shape of the bug. A union key (`Record<Surface, string>`)
 * is pinned by the compiler, and an unannotated table has its keys inferred, so `noImplicitAny`
 * already refuses a `string` index. Neither needs a guard, and not flagging them is what keeps
 * this quiet enough to keep.
 *
 * Cross-file on purpose: `FILTERS` is declared in `template/filters.ts` and read in
 * `template/engine.ts`, so a same-file scan would have missed the read that was actually broken.
 */
const OPEN_TABLE = /^(?:export )?const ([A-Za-z_$][\w$]*) *: *(?:Partial<)?Record<\s*string\s*,/gm

/**
 * Reads that are safe for a reason no type can carry. Each is a decision somebody made, not an
 * exemption: the key is a value this code produced itself, or a runtime check has narrowed it on
 * the lines above. Anything else belongs in `lookup()`.
 */
const TABLE_ALLOWED = new Set([
  // `Object.keys(PERIODS)`, so every key is one of the table's own.
  'widgets/chart/model.ts PERIODS[a]',
  'widgets/chart/model.ts PERIODS[b]'
])

describe('tables indexed by a key this code did not choose', () => {
  const openTables = () => {
    const tables = new Set()
    for (const text of CODE.values()) {
      for (const m of text.matchAll(OPEN_TABLE)) tables.add(m[1])
    }
    return tables
  }

  it('finds the open tables it exists to police, so the rule cannot silently match nothing', () => {
    const tables = openTables()
    // The two this project has actually been bitten through.
    expect(tables.has('FILTERS')).toBe(true)
    expect(tables.has('PERIODS')).toBe(true)
    expect(tables.size).toBeGreaterThan(4)
  })

  it('reads every open table through lookup(), or records why a bare index is safe', () => {
    const tables = openTables()
    const offenders = []
    for (const [path, text] of CODE) {
      for (const table of tables) {
        const reads = new RegExp('\\b' + table + '\\[(?![\'"`])([^\\]]*)\\]', 'g')
        for (const m of text.matchAll(reads)) {
          const entry = rel(path) + ' ' + table + '[' + m[1] + ']'
          if (!TABLE_ALLOWED.has(entry)) offenders.push(entry)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

/* ------------------------------------------------------------------ *
 * History fetches are cancellable
 * ------------------------------------------------------------------ */

/**
 * `LoadRequest.signal` was declared and forwarded, and not one of the six callers supplied it -
 * so leaving a chart-heavy dashboard left every request downloading to completion, and a run of
 * period chips issued one per chip and finished them all. They compete for the browser's
 * six-per-origin socket budget, which is the same budget `api/tabLink.ts` exists to conserve and
 * the same starvation that once made every widget on a third tab look dead.
 *
 * Written as a scan because the miss is silent: the results are correctly discarded either way,
 * so nothing observable is wrong and no test could notice. Applying this rule caught a seventh
 * call site that had been missed while fixing the other six by hand.
 */
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
      // The definitions themselves, which take the signal rather than passing one.
      if (/api\/persistence\.ts$|chart\/data\.ts$/.test(rel(path))) continue
      for (const m of text.matchAll(CALLS)) {
        // The call's arguments, up to the matching close paren.
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

/* ------------------------------------------------------------------ *
 * Maps keyed by item names
 * ------------------------------------------------------------------ */

/**
 * An item-state map is read with whatever name a widget or a template asks for, and openHAB
 * allows an item called `constructor` (`ItemUtil.isValidItemName` is `[a-zA-Z_][a-zA-Z0-9_]*`).
 * `store/items.ts` builds its maps prototype-free for that reason; three call sites then rebuilt
 * ordinary objects out of them with `Object.fromEntries`, which put the prototype straight back.
 * `selectStates` is the one way to take a subset.
 */
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
