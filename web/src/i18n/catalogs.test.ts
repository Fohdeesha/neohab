import { describe, expect, it } from 'vitest'
// suffixed, or the Italian catalog imports as `it` and shadows vitest's own
import deCatalog from './de.json'
import esCatalog from './es.json'
import frCatalog from './fr.json'
import itCatalog from './it.json'
import nlCatalog from './nl.json'
import plCatalog from './pl.json'

const CATALOGS: Record<string, Record<string, string>> = {
  de: deCatalog,
  es: esCatalog,
  fr: frCatalog,
  it: itCatalog,
  nl: nlCatalog,
  pl: plCatalog
}
const LANGS = Object.keys(CATALOGS)

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const baseKey = (k: string) => k.replace(PLURAL_SUFFIX, '')
const placeholders = (s: string) => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s+/g, '')).sort()

describe.each(LANGS)('%s catalog', (lang) => {
  const catalog = CATALOGS[lang]
  const keys = Object.keys(catalog)

  it('is in localeCompare order', () => {
    // localeCompare order, not codepoint: a JSON round trip would reorder the whole file
    const sorted = [...keys].sort((a, b) => a.localeCompare(b))
    const firstWrong = keys.findIndex((k, i) => k !== sorted[i])
    expect(firstWrong === -1 ? null : keys[firstWrong]).toBeNull()
  })

  it('has no empty translation', () => {
    expect(keys.filter((k) => !catalog[k] || !catalog[k].trim())).toEqual([])
  })

  it('invents no placeholder its key does not declare', () => {
    const wrong = keys.filter((k) => {
      const declared = placeholders(baseKey(k))
      const used = placeholders(catalog[k])
      const invented = used.filter((p) => !declared.includes(p))
      if (invented.length) return true
      return /_(zero|one)$/.test(k) ? false : JSON.stringify(used) !== JSON.stringify(declared)
    })
    expect(wrong).toEqual([])
  })

  it('uses hyphens rather than dashes, as the project writes everywhere', () => {
    // escapes on purpose, or this file would contain the very characters it forbids
    expect(keys.filter((k) => /[\u2014\u2013\u2011]/.test(catalog[k]))).toEqual([])
  })
})

describe('the catalogs agree with each other', () => {
  it('covers the same strings in every language', () => {
    const sets = Object.fromEntries(LANGS.map((l) => [l, new Set(Object.keys(CATALOGS[l]).map(baseKey))]))
    const reference = sets.de
    for (const lang of LANGS) {
      const missing = [...reference].filter((k) => !sets[lang].has(k))
      const extra = [...sets[lang]].filter((k) => !reference.has(k))
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] })
    }
  })
})
