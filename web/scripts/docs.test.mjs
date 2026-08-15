/**
 * The repository's own documentation: that its links go somewhere, and that it stays within the
 * Markdown subset the shipped copy can render.
 *
 * Both of these have been wrong in ways nobody noticed. Every relative link in CONTRIBUTING.md
 * pointed at a path that did not exist, because the file was written as though it lived in
 * `docs/`; a broken link in a contributing guide is invisible until someone follows it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown.mjs'
import { TOKEN_SPECS } from '../src/themes/tokens.ts'
import { ATTRIBUTE_PAINTED } from '../src/themes/cssRules.ts'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILES = ['README.md', 'CONTRIBUTING.md', 'docs/theming.md', 'e2e/README.md']

/** Relative links in one file, as [text](target) with anchors and external URLs dropped. */
function relativeLinks(markdown) {
  const out = []
  for (const m of markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    const target = m[1]
    if (/^(https?:|mailto:|#)/.test(target)) continue
    out.push(target.split('#')[0])
  }
  return out
}

describe('the documentation', () => {
  for (const file of FILES) {
    describe(file, () => {
      const path = join(repo, file)
      const src = readFileSync(path, 'utf8')

      it('links only to things that exist', () => {
        const broken = relativeLinks(src).filter((target) => !existsSync(resolve(dirname(path), target)))
        expect(broken.join(', ')).toBe('')
      })
    })
  }

  it('renders without hitting an unsupported construct', () => {
    // docs/ is what ships inside the add-on, so it is the set that has to render. The renderer
    // throws rather than mangling, which is what makes this check worth having.
    const src = readFileSync(join(repo, 'docs', 'theming.md'), 'utf8')
    expect(() => renderMarkdown(src, 'theming.md')).not.toThrow()
  })
})

/**
 * The theming guide is what a person reads before writing a theme, and it ships inside the
 * add-on, so a stale table is shipped too. These keep it honest about the one thing that is easy
 * to get wrong: which tokens and classes exist.
 */
describe('docs/theming.md against the code', () => {
  const doc = readFileSync(join(repo, 'docs', 'theming.md'), 'utf8')

  it('states the number of tokens there actually are', () => {
    const m = /a theme can be four\s+colours or all (\d+)\./.exec(doc)
    expect(m, 'the sentence naming the token count has moved or changed').toBeTruthy()
    expect(Number(m[1])).toBe(TOKEN_SPECS.length)
  })

  it('mentions every token it asks people to set', () => {
    for (const spec of TOKEN_SPECS) {
      // The chart palette is documented as the range `chart-1` ... `chart-8`, not eight rows.
      if (/^chart-[2-7]$/.test(spec.key)) continue
      expect(doc.includes('`' + spec.key + '`'), `never mentions the "${spec.key}" token`).toBe(true)
    }
  })

  it('lists every attribute-painted class in the rule that says not to paint them', () => {
    for (const cls of ATTRIBUTE_PAINTED) {
      expect(doc.includes(cls), `omits .${cls} from the fill/stroke rule`).toBe(true)
    }
  })
})
