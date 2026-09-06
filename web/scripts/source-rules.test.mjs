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

const OPEN_TABLE = /^(?:export )?const ([A-Za-z_$][\w$]*) *: *(?:Partial<)?Record<\s*string\s*,/gm

const TABLE_ALLOWED = new Set(['widgets/chart/model.ts PERIODS[a]', 'widgets/chart/model.ts PERIODS[b]'])

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
