/**
 * Structural checks over the translation catalogs.
 *
 * These have been run from a session scratchpad for months, which means a contributor cloning the
 * repo ran none of them and a catalog could drift between sessions without anything noticing.
 * They are cheap and mechanical, so they belong where anyone who can break them is standing.
 *
 * What is deliberately NOT checked here: whether every `t()` call in the source has a catalog
 * entry. That needs an extractor over the whole tree, and a missing entry degrades to readable
 * English rather than breaking anything - the failures below are the ones that bite.
 */
import { describe, expect, it } from 'vitest'
// Suffixed because the Italian catalog would otherwise be imported as `it` and shadow vitest's
// own `it`, which fails as "(0, default) is not a function" a long way from the cause.
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

/** i18next appends a plural category to the key; languages disagree about how many they have. */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/
const baseKey = (k: string) => k.replace(PLURAL_SUFFIX, '')
const placeholders = (s: string) => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s+/g, '')).sort()

describe.each(LANGS)('%s catalog', (lang) => {
  const catalog = CATALOGS[lang]
  const keys = Object.keys(catalog)

  it('is in localeCompare order', () => {
    // The order the project maintains by hand. A codepoint sort (what JSON tooling and Python's
    // sorted() produce) would reorder accented keys and turn a one-line addition into a rewrite.
    const sorted = [...keys].sort((a, b) => a.localeCompare(b))
    const firstWrong = keys.findIndex((k, i) => k !== sorted[i])
    expect(firstWrong === -1 ? null : keys[firstWrong]).toBeNull()
  })

  it('has no empty translation', () => {
    expect(keys.filter((k) => !catalog[k] || !catalog[k].trim())).toEqual([])
  })

  it('invents no placeholder its key does not declare', () => {
    // A renamed or misspelt {{count}} renders the literal braces to the user.
    //
    // A SINGULAR form is allowed to use fewer than the key declares: Italian's "…e un altro"
    // spells the number as a word, which is better Italian than "…e 1 altro". Every other form
    // has to carry them all, or a plural loses the number it exists to show.
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
    // Written as escapes on purpose: em, en and non-breaking dash. Spelling them literally would
    // put the very characters the project forbids into the file that forbids them, where the next
    // sweep would flag this check as the offender.
    expect(keys.filter((k) => /[\u2014\u2013\u2011]/.test(catalog[k]))).toEqual([])
  })
})

describe('the catalogs agree with each other', () => {
  it('covers the same strings in every language', () => {
    // Compared on base keys: Polish has more plural categories than the rest, so raw key sets
    // legitimately differ in size while the strings they cover must not.
    const sets = Object.fromEntries(LANGS.map((l) => [l, new Set(Object.keys(CATALOGS[l]).map(baseKey))]))
    const reference = sets.de
    for (const lang of LANGS) {
      const missing = [...reference].filter((k) => !sets[lang].has(k))
      const extra = [...sets[lang]].filter((k) => !reference.has(k))
      expect({ lang, missing, extra }).toEqual({ lang, missing: [], extra: [] })
    }
  })
})
