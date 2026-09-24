/**
 * NOTICE has to list everything whose bytes end up in the jar, because MIT, Apache-2.0, BSD and OFL
 * all require their notices to travel with the distribution and the build strips legal comments. That
 * is a marketplace rule as well as openHAB's own checklist, and it is exactly the kind of thing
 * that rots the next time somebody adds a dependency.
 *
 * A package with no entry in LABELS fails rather than being skipped, so adding one forces the
 * decision instead of quietly shipping unattributed.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..')
const repo = join(web, '..')

const notice = readFileSync(join(repo, 'NOTICE'), 'utf8')
const pkg = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(web, 'package-lock.json'), 'utf8'))
const staging = readFileSync(join(here, 'stage-assets.mjs'), 'utf8')
const hls = join(web, 'node_modules', 'hls.js')

// build tools (devDependencies) that write some of their own code into what the jar serves, so
// `dependencies` cannot show them. copyright is checked against the package's own licence file
const WORKBOX = { label: 'Workbox', copyright: 'Copyright 2018 Google LLC' }
const BUNDLED = {
  'workbox-build': WORKBOX,
  'workbox-core': WORKBOX,
  'workbox-precaching': WORKBOX,
  'workbox-routing': WORKBOX,
  'workbox-strategies': WORKBOX,
  'workbox-window': WORKBOX,
  '@trickfilm400/rollup-plugin-off-main-thread': {
    label: 'rollup-plugin-off-main-thread',
    copyright: 'Copyright 2018 Google Inc. All Rights Reserved.',
    file: 'loader.ejs'
  },
  'vite-plugin-pwa': { label: 'vite-plugin-pwa', copyright: 'Copyright (c) 2020-PRESENT Anthony Fu <https://github.com/antfu>' },
  vite: { label: 'Vite', copyright: 'Copyright (c) 2019-present, VoidZero Inc. and Vite contributors', file: 'LICENSE.md' }
}

// workbox-build installs every workbox module; with the current vite.config.ts these never reach
// the output (check-jar.sh looks for each one's marker in the jar's scripts)
const WORKBOX_NOT_SHIPPED = [
  'workbox-background-sync',
  'workbox-broadcast-update',
  'workbox-cacheable-response',
  'workbox-expiration',
  'workbox-google-analytics',
  'workbox-navigation-preload',
  'workbox-range-requests',
  'workbox-recipes',
  'workbox-streams',
  'workbox-sw'
]

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
  '@iconify-json/meteocons': 'Meteocons',
  ...Object.fromEntries(Object.entries(BUNDLED).map(([name, b]) => [name, b.label]))
}

// what stage-assets.mjs copies out of node_modules, read off the script so a new pack is caught
function stagedPackages() {
  const found = new Set()
  for (const m of staging.matchAll(/'node_modules',\s*'([^']+)'(?:,\s*'([^']+)')?/g)) {
    // the iconify packs are reached through a helper, so the path literal ends at the scope;
    // a dot folder (the stamps under .cache) is not a package
    if (m[1] === '@iconify-json' || m[1].startsWith('.')) continue
    found.add(m[1].startsWith('@') && m[2] ? `${m[1]}/${m[2]}` : m[1])
  }
  for (const m of staging.matchAll(/stageIconifyPack\(\{[^}]*pkg:\s*'([^']+)'/g)) {
    found.add('@iconify-json/' + m[1])
  }
  return found
}

const shipped = new Set([...Object.keys(pkg.dependencies ?? {}), ...stagedPackages(), ...Object.keys(BUNDLED)])

function installedVersion(name) {
  const p = join(web, 'node_modules', name, 'package.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).version : null
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// the version on the entry's own heading line, which is where every entry starts
function noticeVersion(label) {
  return new RegExp('^' + escape(label) + '[^\\n]*?(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.]+)?)', 'm').exec(notice)?.[1]
}

// the DASH-IF notice exactly as hls.js carries it, less the comment markers
function dashNotice() {
  const src = readFileSync(join(hls, 'src', 'utils', 'cea-608-parser.ts'), 'utf8').split('\n')
  const start = src.findIndex((l) => l.includes('The copyright in this software is being made available under the BSD License'))
  const end = src.findIndex((l) => l.includes('POSSIBILITY OF SUCH DAMAGE.'))
  if (start < 0 || end < start) return null
  return src
    .slice(start, end + 1)
    .map((l) => l.replace(/\r$/, '').replace(/^ \*( |$)/, ''))
    .join('\n')
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
    expect(notice).toContain('BSD 3-Clause')
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
      const said = noticeVersion(LABELS[d])
      if (said !== v) wrong.push(`${d}: installed ${v}, NOTICE says ${said ?? 'nothing'}`)
    }
    expect(wrong, wrong.join(' | ')).toEqual([])
  })

  it('gives each bundled build tool the copyright line its own licence carries', () => {
    const wrong = []
    for (const [name, b] of Object.entries(BUNDLED)) {
      const file = join(web, 'node_modules', name, b.file ?? 'LICENSE')
      if (!existsSync(file) || !readFileSync(file, 'utf8').includes(b.copyright)) wrong.push(`${name}: ${b.copyright} is not in ${file}`)
      else if (!notice.includes(b.copyright)) wrong.push(`${name}: NOTICE lacks ${b.copyright}`)
    }
    expect(wrong, wrong.join(' | ')).toEqual([])
  })

  it('names each workbox package that ships', () => {
    for (const name of Object.keys(BUNDLED).filter((n) => n.startsWith('workbox-'))) {
      expect(notice, `NOTICE never names ${name}`).toContain(name)
    }
  })

  // workbox-build pulls in every workbox module, and which of them ship depends on vite.config.ts,
  // so a new one has to be put in one list or the other rather than slip through unlabelled
  it('knows about every workbox package in the lockfile', () => {
    const inLock = new Set(
      Object.keys(lock.packages ?? {})
        .map((p) => p.slice(p.lastIndexOf('node_modules/') + 'node_modules/'.length))
        .filter((n) => n.startsWith('workbox-'))
    )
    expect(inLock.size, 'no workbox packages found in the lockfile').toBeGreaterThan(5)
    const unknown = [...inLock].filter((n) => !BUNDLED[n] && !WORKBOX_NOT_SHIPPED.includes(n))
    expect(unknown, `decide whether these ship: ${unknown.join(', ')}`).toEqual([])
  })

  it('names the artwork that is ours, so nobody has to guess', () => {
    expect(notice).toContain('assembly-hall.jpg')
    expect(notice).toContain('Original Content')
  })

  it('credits the prior work neohab builds on', () => {
    expect(notice).toContain('HABPanel')
    expect(notice).toContain('Yannick Schaus')
  })

  // openHAB's coding guidelines want the file, the author and the licence named, and NeohabTile
  // follows HABPanelTile closely enough that a reader should be told so. Matching the three
  // bullets as one block, because the prose above them mentions both the file and the author,
  // so anything looser passes with the attribution deleted.
  it('names the one file derived from another project', () => {
    expect(notice).toMatch(
      /^\* File: HABPanelTile\.java[^\n]*\n\* Author: [^\n]*Yannick Schaus[^\n]*\n\* License: Eclipse Public License 2\.0/m
    )
  })
})

// hls.js is one package on the outside and several copyright holders on the inside
describe('NOTICE and the code inside hls.js', () => {
  it('carries every copyright line in hls.js’s licence and source', () => {
    const files = [join(hls, 'LICENSE')]
    for (const f of readdirSync(join(hls, 'src'), { recursive: true })) {
      if (/\.[jt]s$/.test(f)) files.push(join(hls, 'src', f))
    }
    const lines = new Set()
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bcopyright\s+(?:\(c\)\s*)?\d{4}[^\r\n]*/gi)) lines.add(m[0].trim())
    }
    // Dailymotion, Brightcove, DASH-IF, vtt.js and utf.js today
    expect(lines.size, 'the scan found almost nothing, so it is not looking in the right place').toBeGreaterThanOrEqual(5)
    const missing = [...lines].filter((l) => !notice.includes(l))
    expect(missing, `copyright lines hls.js ships that NOTICE lacks: ${missing.join(' | ')}`).toEqual([])
  })

  it('names the eventemitter3 that hls.js builds in', () => {
    const pinned = JSON.parse(readFileSync(join(hls, 'package.json'), 'utf8')).devDependencies?.eventemitter3
    expect(pinned, 'hls.js no longer names eventemitter3; check whether it still bundles it').toBeTruthy()
    expect(readFileSync(join(hls, 'dist', 'hls.mjs'), 'utf8')).toContain('eventemitter3')
    expect(noticeVersion('eventemitter3')).toBe(pinned.replace(/^[\^~]/, ''))
    expect(notice).toContain('Copyright (c) 2014 Arnout Kazemier')
  })

  // BSD-3 wants the notice itself reproduced with a binary, not a pointer to it
  it('reproduces the DASH-IF notice word for word', () => {
    const text = dashNotice()
    expect(text, 'the DASH-IF notice has moved inside hls.js').toBeTruthy()
    expect(text.split('\n').length).toBeGreaterThan(20)
    expect(notice.includes(text), 'NOTICE does not carry the DASH-IF notice verbatim').toBe(true)
  })
})
