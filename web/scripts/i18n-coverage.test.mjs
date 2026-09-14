// Does every string the app can show actually have a translation, and does every translation still
// have a string? Both directions, read off the source rather than off a list somebody maintains.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name !== 'i18n') sources(path, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

const FILES = sources(src)
const rel = (path) => relative(src, path).split('\\').join('/')
const catalog = JSON.parse(readFileSync(join(src, 'i18n', 'de.json'), 'utf8'))
const translated = new Set(Object.keys(catalog).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')))

const text = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined)

// t('x') and i18n.t('x') and AppBoundary's say('x'), which forwards to i18n.t
const TRANSLATORS = new Set(['t', 'say'])

function scan() {
  const calls = []
  const notes = []
  for (const path of FILES) {
    const source = readFileSync(path, 'utf8')
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const walk = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        const named = ts.isPropertyAccessExpression(callee) ? callee.name : callee
        const fn = ts.isIdentifier(named) ? named.text : ''
        if (TRANSLATORS.has(fn)) {
          const key = text(node.arguments[0])
          if (key !== undefined && key !== '') calls.push({ key, where: rel(path) })
        }
        // the HABPanel import report renders every note as t(note.message)
        if (fn === 'add' && ts.isPropertyAccessExpression(callee) && callee.expression.getText(sf) === 'report') {
          const message = text(node.arguments[1])
          if (message !== undefined) notes.push({ key: message, where: rel(path) })
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(sf)
  }
  return { calls, notes }
}

const { calls, notes } = scan()

describe('translation coverage', () => {
  it('has sources to scan, so an empty pass cannot look like a clean one', () => {
    expect(FILES.length).toBeGreaterThan(100)
    expect(calls.length).toBeGreaterThan(500)
    expect(notes.length).toBeGreaterThan(10)
  })

  it('translates every string written straight into a t() call', () => {
    const missing = [...new Map(calls.map((c) => [c.key, c])).values()]
      .filter((c) => !translated.has(c.key))
      .map((c) => `${c.where}: ${JSON.stringify(c.key)}`)
    expect(missing).toEqual([])
  })

  it('translates every note the HABPanel import report can produce', () => {
    const missing = notes.filter((n) => !translated.has(n.key)).map((n) => `${n.where}: ${JSON.stringify(n.key)}`)
    expect(missing).toEqual([])
  })

  it('carries no key the source can no longer produce', () => {
    // deliberately crude: a key counts as used if its text appears anywhere in the source at all,
    // because plenty of them reach t() through a variable. The question is only whether a rename
    // has left one behind.
    const haystack = FILES.map((path) => readFileSync(path, 'utf8')).join('\n\u0000\n')
    const dead = [...translated].filter((key) => !haystack.includes(key))
    expect(dead).toEqual([])
  })
})
