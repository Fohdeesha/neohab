/**
 * The theming contract, checked across every built-in theme.
 *
 * These are the mistakes that kept recurring, each caught by eye after the fact. They are all
 * mechanically checkable from the stylesheet text in milliseconds, which is what this file is
 * for: a new theme either follows the rules or the suite says which one it broke.
 *
 * The rules themselves are documented for theme authors in `docs/theming.md`.
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_THEMES, BUILTIN_THEME_IDS, listThemes, resolveTheme, themeCss, type Theme } from './themes'
import { ATTRIBUTE_PAINTED } from './css/shared'
import { TOKEN_SPECS, isUsableTokenValue } from './tokens'

/** Every theme that carries a stylesheet, with it resolved. */
async function styledThemes(): Promise<{ theme: Theme; css: string }[]> {
  const out: { theme: Theme; css: string }[] = []
  for (const theme of BUILTIN_THEMES) {
    const css = await themeCss(theme)
    if (css) out.push({ theme, css })
  }
  return out
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Rules in a stylesheet as `[selector, body]`, including those nested in at-rules. */
function rules(css: string): [string, string][] {
  const out: [string, string][] = []
  const scan = (text: string) => {
    let depth = 0
    let start = 0
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        depth++
      } else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const rule = text.slice(start, i + 1)
          const brace = rule.indexOf('{')
          const selector = rule.slice(0, brace).trim()
          const body = rule.slice(brace + 1, -1)
          if (body.includes('{')) scan(body)
          else out.push([selector, body])
          start = i + 1
        }
      }
    }
  }
  scan(stripComments(css))
  return out
}

/** Rules whose selector is inside an at-rule block (a container/media query). */
function gatedSelectors(css: string): Set<string> {
  const gated = new Set<string>()
  for (const block of stripComments(css).matchAll(/@[a-z-]+[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const [selector] of rules('x' + block[1] + '}')) gated.add(selector)
    for (const m of block[1].matchAll(/([^{}]+)\{/g)) gated.add(m[1].trim())
  }
  return gated
}

describe('the built-in themes', () => {
  it('are all resolvable, and none shadows another', () => {
    const ids = BUILTIN_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(resolveTheme(id, []).id).toBe(id)
  })

  it('only use tokens the contract declares', () => {
    const known = new Set(TOKEN_SPECS.map((s) => s.key))
    for (const theme of BUILTIN_THEMES) {
      for (const key of Object.keys(theme.tokens)) {
        expect(known, `${theme.id} sets an undeclared token "${key}"`).toContain(key)
      }
    }
  })

  it('only use token values that will actually be applied', () => {
    for (const theme of BUILTIN_THEMES) {
      for (const [key, value] of Object.entries(theme.tokens)) {
        expect(isUsableTokenValue(value), `${theme.id}.${key} = ${String(value)}`).toBe(true)
      }
    }
  })

  it('load every stylesheet they name', async () => {
    for (const theme of BUILTIN_THEMES) {
      if (!theme.cssModule) continue
      const css = await themeCss(theme)
      expect(css, `${theme.id} names a stylesheet that did not load`).toBeTruthy()
    }
  })
})

describe('theme stylesheet rules', () => {
  /**
   * Rule 4: the paint of these elements is an SVG attribute the widget computes - a per-instance
   * gradient, a severity colour, a live tint. A stylesheet fill/stroke beats an attribute, which
   * is how a lit gauge bead turns black and a compass cardinal turns grey.
   */
  it('never set fill or stroke on an attribute-painted element', async () => {
    for (const { theme, css } of await styledThemes()) {
      for (const [selector, body] of rules(css)) {
        for (const cls of ATTRIBUTE_PAINTED) {
          if (!new RegExp(`\\.${cls}\\b`).test(selector)) continue
          expect(
            /(^|[;{\s])(fill|stroke)\s*:/.test(body),
            `${theme.id}: "${selector}" sets fill/stroke on .${cls}, which is painted by attribute`
          ).toBe(false)
        }
      }
    }
  })

  /**
   * Rule 2: app.css sheds padding in short and narrow cells. A theme sheet loads afterwards, so
   * an ungated padding override wins over those sheds and puts the clipping back.
   */
  it('gate every padding override on cell size', async () => {
    for (const { theme, css } of await styledThemes()) {
      const gated = gatedSelectors(css)
      for (const [selector, body] of rules(css)) {
        if (!/(^|[;{\s])padding\s*:/.test(body)) continue
        if (!/nh-widget__(label|body)/.test(selector)) continue
        expect(
          gated.has(selector),
          `${theme.id}: "${selector}" sets padding outside a @container gate`
        ).toBe(true)
      }
    }
  })

  /**
   * Rule 3: BEM modifiers share specificity with their base class, so a theme that restyles the
   * base flattens the active state unless it restyles that too.
   */
  it('restyle the active state of any control they restyle', async () => {
    const CONTROLS = ['nh-button', 'nh-selection__btn']
    for (const { theme, css } of await styledThemes()) {
      const selectors = rules(css).map(([s]) => s)
      for (const control of CONTROLS) {
        const stylesBase = selectors.some((s) =>
          new RegExp(`\\.${control}(?![\\w-])`).test(s) && !s.includes(`${control}--active`)
        )
        if (!stylesBase) continue
        const stylesActive = selectors.some((s) => s.includes(`${control}--active`))
        expect(stylesActive, `${theme.id} restyles .${control} but not .${control}--active`).toBe(true)
      }
    }
  })

  /** Rule 5: a border gradient squares off rounded corners, so the two cannot be combined. */
  it('only use border-image when their radius is 0', async () => {
    for (const { theme, css } of await styledThemes()) {
      const uses = rules(css).some(([, body]) => /border-image\s*:\s*(?!none)/.test(body))
      if (!uses) continue
      expect(theme.tokens.radius, `${theme.id} uses border-image with a non-zero radius`).toBe('0px')
    }
  })

  /**
   * A blanket `.nh-widget, .nh-tile` rule silently breaks the two tiles that asked not to be one:
   * bare widgets (label, clock) and the dashed "+ New dashboard" invitation.
   */
  it('put back the bare widget and the new-dashboard tile after a blanket tile rule', async () => {
    for (const { theme, css } of await styledThemes()) {
      const selectors = rules(css).map(([s]) => s)
      const blankets = selectors.some((s) => /\.nh-widget\b/.test(s) && /\.nh-tile\b/.test(s))
      if (!blankets) continue
      // A theme may deliberately panel them instead - the LCD console has no unboxed content at
      // all - but it has to say so in the stylesheet, so the deviation is a decision on record
      // rather than something nobody noticed.
      if (!css.includes('nh-theme-allow: bare-panelled')) {
        expect(
          selectors.some((s) => s.includes('nh-widget--bare')),
          `${theme.id} paints every widget but never restores .nh-widget--bare ` +
            '(declare "nh-theme-allow: bare-panelled" in the stylesheet if that is deliberate)'
        ).toBe(true)
      }
      expect(
        selectors.some((s) => s.includes('nh-tile--new')),
        `${theme.id} paints every tile but never restores .nh-tile--new`
      ).toBe(true)
    }
  })

  /** A font a theme declares has to be one the add-on actually ships. */
  it('only reference bundled assets', async () => {
    const BUNDLED = /^(fonts|backgrounds|icons)\//
    for (const { theme, css } of await styledThemes()) {
      for (const m of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
        expect(BUNDLED.test(m[1]), `${theme.id} references "${m[1]}", which is not a bundled path`).toBe(true)
      }
    }
  })
})

describe('theme resolution', () => {
  const custom = (id: string): Theme => ({ id, name: 'Mine', scheme: 'dark', tokens: {} })

  it('never lets a custom theme shadow a built-in', () => {
    // An imported theme file can carry any id it likes, including one of ours.
    const themes = [custom('dark'), custom('mine')]
    expect(resolveTheme('dark', themes).name).toBe('neohab Dark')
    expect(resolveTheme('mine', themes).name).toBe('Mine')
  })

  it('lists each theme once, dropping a custom one that shadows a built-in', () => {
    const listed = listThemes([custom('dark'), custom('mine')])
    const ids = listed.map((t) => t.id)
    expect(new Set(ids).size, 'a duplicate id would give two cards with the same React key').toBe(ids.length)
    expect(ids).toContain('mine')
    expect(listed.filter((t) => t.id === 'dark')).toHaveLength(1)
  })

  it('falls back to the default theme for an id that no longer exists', () => {
    expect(resolveTheme('deleted-theme', []).id).toBe('dark')
    expect(resolveTheme(undefined, []).id).toBe('dark')
  })

  it('knows which ids are reserved', () => {
    expect(BUILTIN_THEME_IDS.has('swiss')).toBe(true)
    expect(BUILTIN_THEME_IDS.has('mine')).toBe(false)
  })
})

describe('the token contract', () => {
  it('describes every token it declares', () => {
    for (const spec of TOKEN_SPECS) {
      expect(spec.label.length, `${spec.key} has no label`).toBeGreaterThan(0)
      expect(spec.hint.length, `${spec.key} has no hint`).toBeGreaterThan(10)
      expect(spec.fallback.length, `${spec.key} has no documented fallback`).toBeGreaterThan(0)
    }
  })

  it('has no duplicate keys', () => {
    const keys = TOKEN_SPECS.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('rejects values that have no business in a custom property', () => {
    expect(isUsableTokenValue('#ffcc00')).toBe(true)
    expect(isUsableTokenValue('color-mix(in srgb, red 50%, blue)')).toBe(true)
    expect(isUsableTokenValue('red; } body { display: none')).toBe(false)
    expect(isUsableTokenValue('red /* sneaky */')).toBe(false)
    expect(isUsableTokenValue('')).toBe(false)
    expect(isUsableTokenValue(undefined)).toBe(false)
    expect(isUsableTokenValue('x'.repeat(500))).toBe(false)
  })
})
