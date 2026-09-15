/**
 * NOTICE has to list everything whose bytes end up in the jar, because MIT, Apache-2.0 and OFL all
 * require their notices to travel with the distribution and the build strips legal comments. That
 * is a marketplace rule as well as openHAB's own checklist, and it is exactly the kind of thing
 * that rots the next time somebody adds a dependency.
 *
 * A package with no entry in LABELS fails rather than being skipped, so adding one forces the
 * decision instead of quietly shipping unattributed.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..')
const repo = join(web, '..')

const notice = readFileSync(join(repo, 'NOTICE'), 'utf8')
const pkg = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'))
const staging = readFileSync(join(here, 'stage-assets.mjs'), 'utf8')

// how each shipped package is named in NOTICE
const LABELS = {
  react: 'React',
  'react-dom': 'React DOM',
  'react-i18next': 'react-i18next',
  i18next: 'i18next',
  zustand: 'Zustand',
  uplot: 'uPlot',
  'hls.js': 'hls.js',
  dompurify: 'DOMPurify',
  jsep: 'jsep',
  '@jsep-plugin/assignment': '@jsep-plugin/assignment',
  '@jsep-plugin/object': '@jsep-plugin/object',
  '@mdi/svg': 'Material Design Icons',
  dseg: 'DSEG',
  '@fontsource-variable/montserrat': 'Montserrat',
  '@fontsource/poppins': 'Poppins',
  '@iconify-json/flat-color-icons': 'Flat Color Icons',
  '@iconify-json/fluent-emoji-flat': 'Fluent Emoji',
  '@iconify-json/meteocons': 'Meteocons'
}

// what stage-assets.mjs copies out of node_modules, read off the script so a new pack is caught
function stagedPackages() {
  const found = new Set()
  for (const m of staging.matchAll(/'node_modules',\s*'([^']+)'(?:,\s*'([^']+)')?/g)) {
    // the iconify packs are reached through a helper, so the path literal ends at the scope
    if (m[1] === '@iconify-json') continue
    found.add(m[1].startsWith('@') && m[2] ? `${m[1]}/${m[2]}` : m[1])
  }
  for (const m of staging.matchAll(/stageIconifyPack\(\{[^}]*pkg:\s*'([^']+)'/g)) {
    found.add('@iconify-json/' + m[1])
  }
  return found
}

const shipped = new Set([...Object.keys(pkg.dependencies ?? {}), ...stagedPackages()])

function installedVersion(name) {
  const p = join(web, 'node_modules', name, 'package.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).version : null
}

describe('NOTICE', () => {
  it('declares the project licence', () => {
    expect(notice).toContain('SPDX-License-Identifier: EPL-2.0')
    expect(notice).toContain('Eclipse Public License 2.0')
  })

  it('carries the full text of every licence it cites', () => {
    expect(notice).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION')
    expect(notice).toContain('Permission is hereby granted, free of charge')
    expect(notice).toContain('SIL OPEN FONT LICENSE')
  })

  it('names every package whose bytes ship in the jar', () => {
    const unnamed = [...shipped].filter((d) => !LABELS[d])
    expect(unnamed, `no NOTICE label declared for: ${unnamed.join(', ')}`).toEqual([])
    const missing = [...shipped].filter((d) => LABELS[d] && !notice.includes(LABELS[d]))
    expect(missing, `shipped but absent from NOTICE: ${missing.join(', ')}`).toEqual([])
  })

  it('lists the version that is actually installed', () => {
    const wrong = []
    for (const d of shipped) {
      const v = installedVersion(d)
      if (!v) continue
      const m = new RegExp(LABELS[d].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\n]*?(\\d+\\.\\d+\\.\\d+)').exec(notice)
      if (m?.[1] !== v) wrong.push(`${d}: installed ${v}, NOTICE says ${m?.[1] ?? 'nothing'}`)
    }
    expect(wrong, wrong.join(' | ')).toEqual([])
  })

  it('names the artwork that is ours, so nobody has to guess', () => {
    expect(notice).toContain('assembly-hall.jpg')
    expect(notice).toContain('Original Content')
  })

  it('credits the prior work neohab builds on', () => {
    expect(notice).toContain('HABPanel')
    expect(notice).toContain('Yannick Schaus')
  })
})
