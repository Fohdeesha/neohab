import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown.mjs'
import { TOKEN_SPECS } from '../src/themes/tokens.ts'
import { ATTRIBUTE_PAINTED } from '../src/themes/cssRules.ts'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILES = ['README.md', 'CONTRIBUTING.md', 'docs/theming.md', 'e2e/README.md']

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
    const src = readFileSync(join(repo, 'docs', 'theming.md'), 'utf8')
    expect(() => renderMarkdown(src, 'theming.md')).not.toThrow()
  })
})

describe('docs/theming.md against the code', () => {
  const doc = readFileSync(join(repo, 'docs', 'theming.md'), 'utf8')

  it('states the number of tokens there actually are', () => {
    const m = /a theme can be four\s+colours or all (\d+)\./.exec(doc)
    expect(m, 'the sentence naming the token count has moved or changed').toBeTruthy()
    expect(Number(m[1])).toBe(TOKEN_SPECS.length)
  })

  it('mentions every token it asks people to set', () => {
    for (const spec of TOKEN_SPECS) {
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
