import { describe, expect, it } from 'vitest'
import { BUILTIN_THEME_IDS, BUILTIN_THEMES, listThemes, resolveTheme, themeCss, type Theme } from './themes'
import { checkThemeCss, describeIssue, parseRules, type RuleId } from './cssRules'
import { TOKEN_SPECS, isUsableTokenValue } from './tokens'
import { contrastOf } from './contrast'
import { THEME_MAP } from '../importer/habpanel'

async function styledThemes(): Promise<{ theme: Theme; css: string }[]> {
  const out: { theme: Theme; css: string }[] = []
  for (const theme of BUILTIN_THEMES) {
    const css = await themeCss(theme)
    if (css) out.push({ theme, css })
  }
  return out
}

async function expectNoneBreak(rule: RuleId): Promise<void> {
  for (const { theme, css } of await styledThemes()) {
    const broken = checkThemeCss(css, { radius: theme.tokens.radius ?? '12px' }).filter((i) => i.rule === rule)
    expect(broken.map((i) => `${theme.id}: ${describeIssue(i)}`).join('\n')).toBe('')
  }
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

describe('the built-in stylesheets follow the rules', () => {
  it('never set fill or stroke on an attribute-painted element', () => expectNoneBreak('attributePaint'))

  it('gate every padding override on cell size', () => expectNoneBreak('ungatedPadding'))

  it('restyle the active state of any control they restyle', () => expectNoneBreak('activeState'))

  it('only use border-image when their radius is 0', () => expectNoneBreak('borderImageRadius'))

  it('put back the bare widget after a blanket tile rule', () => expectNoneBreak('bareWidget'))
  it('put back the new-dashboard tile after a blanket tile rule', () => expectNoneBreak('newTile'))

  it('only reference bundled assets', () => expectNoneBreak('externalAsset'))
})

describe('the stylesheet checker', () => {
  const check = (css: string, radius = '12px') => checkThemeCss(css, { radius }).map((i) => i.rule)

  it('reads rules, including those nested in at-rules', () => {
    const parsed = parseRules('a { color: red } @container (min-width: 10px) { b { color: blue } }')
    expect(parsed.map((r) => r.selector)).toEqual(['a', 'b'])
    expect(parsed[0].gates).toEqual([])
    expect(parsed[1].gates).toEqual(['@container (min-width: 10px)'])
  })

  it('ignores comments, and survives half-typed CSS', () => {
    expect(parseRules('/* .nh-button { fill: red } */ a { color: red }').map((r) => r.selector)).toEqual(['a'])
    expect(() => parseRules('.nh-button { color: red')).not.toThrow()
    expect(parseRules('.a { color: red } .b { color:')).toHaveLength(1)
  })

  it('treats an at-rule holding declarations as no rule at all', () => {
    expect(parseRules("@font-face { font-family: 'X'; src: url('fonts/x.woff2') }")).toHaveLength(0)
  })

  it('keeps its place past everything that used to switch the checks off', () => {
    const after = (prefix: string) => parseRules(prefix + ' .nh-button--plain { color: red }').map((r) => r.selector)
    expect(after('@import url(fonts/a.css);')).toEqual(['.nh-button--plain'])
    expect(after('@charset "utf-8"; @layer base, theme;')).toEqual(['.nh-button--plain'])
    expect(after('} }')).toEqual(['.nh-button--plain'])
    expect(after('.a { content: "}" }')).toEqual(['.a', '.nh-button--plain'])
    expect(after(".a { content: '{' }")).toEqual(['.a', '.nh-button--plain'])
    expect(after('.a { background: url(data:image/svg+xml,<svg><style>a{fill:red}</style></svg>) }')).toEqual(['.a', '.nh-button--plain'])
    // and so the rule after them is still enforced
    expect(check('@import url(fonts/a.css); } .nh-button--plain { color: red }')).toEqual(['activeState'])
  })

  it('catches a base rule that cancels the listening icon button or a chip state, and nothing harmless', () => {
    expect(check('.nh-iconbtn { color: red }')).toEqual(['activeState'])
    expect(check('.nh-iconbtn { color: red } .nh-iconbtn--live { color: blue }')).toEqual([])
    expect(check('.nh-iconbtn { border-radius: 0 }')).toEqual([])
    expect(check('.nh-chip { background: red } .nh-chip--on { background: blue }')).toEqual([])
    expect(check('.nh-chip { border: 1px solid } .nh-chip--on { background: blue }')).toEqual(['activeState'])
    expect(check('.nh-chip { border-radius: 0 }')).toEqual([])
    // each state on its own: a fill cancels the on chip, a border style cancels the dashed action chip
    expect(check('.nh-chip { background: red }')).toEqual(['activeState'])
    expect(check('.nh-chip { border-style: solid } .nh-chip--on { color: red }')).toEqual(['activeState'])
  })

  it('catches a sheet that gives every widget a card and never takes it off the bare ones', () => {
    expect(check('.nh-widget { border-color: red }')).toEqual(['bareWidget'])
    expect(check('.nh-widget { border-color: red } .nh-widget--bare { border-color: transparent }')).toEqual([])
    expect(check('.nh-widget { color: red }')).toEqual([])
  })

  it('counts an @import of a bare string as the outside fetch it is', () => {
    expect(check('@import "https://example.com/x.css";')).toEqual(['externalAsset'])
    expect(check("@import 'fonts/local.css';")).toEqual([])
  })

  it('catches paint on an attribute-painted element, and allows anything else on it', () => {
    expect(check('.nh-gauge__rim { stroke: red }')).toEqual(['attributePaint'])
    expect(check('.nh-gauge__ledlit { fill: red }')).toEqual(['attributePaint'])
    expect(check('.nh-gauge__rim { stroke-width: 3; opacity: 0.5 }')).toEqual([])
  })

  it('catches an ungated padding override, and accepts a gated one', () => {
    expect(check('.nh-widget__body { padding: 8px }')).toEqual(['ungatedPadding'])
    expect(check('.nh-widget__label { padding-top: 8px }')).toEqual(['ungatedPadding'])
    expect(check('@container (min-height: 105px) { .nh-widget__body { padding: 8px } }')).toEqual([])
    expect(check('@media (min-width: 900px) { .nh-widget__body { padding: 8px } }')).toEqual(['ungatedPadding'])
    expect(check('.nh-settings { padding: 8px }')).toEqual([])
  })

  it('catches a base control styled without its active state', () => {
    expect(check('.nh-button { background: red }')).toEqual(['activeState'])
    expect(check('.nh-button { background: red } .nh-button--active { background: blue }')).toEqual([])
    expect(check('.nh-button--active { background: blue }')).toEqual([])
    expect(check('.nh-button__icon { width: 10px }')).toEqual([])
  })

  it('still catches it when the sheet scopes itself to the plain finish, which the built-ins do', () => {
    expect(check('.nh-button--plain { background: red }')).toEqual(['activeState'])
    expect(check('.nh-button--plain { background: red } .nh-button--plain.nh-button--active { background: blue }')).toEqual([])
  })

  it('catches border-image against a rounded radius only', () => {
    expect(check('.nh-widget { border-image: linear-gradient(red, blue) 1 }', '12px')).toEqual(['borderImageRadius'])
    expect(check('.nh-widget { border-image: linear-gradient(red, blue) 1 }', '0px')).toEqual([])
    expect(check('.nh-widget { border-image: none }', '12px')).toEqual([])
  })

  it('catches a blanket tile rule that drops the bare widget or the new tile', () => {
    const blanket = '.nh-widget, .nh-tile { background: red }'
    expect(check(blanket)).toEqual(['bareWidget', 'newTile'])
    expect(check(`${blanket} .nh-widget--bare { background: none } .nh-tile--new { border: 1px dashed red }`)).toEqual([])
    expect(check(`${blanket} .nh-tile--new { border: 1px dashed red } /* nh-theme-allow: bare-panelled */`)).toEqual([])
  })

  it('catches an asset that is not bundled, and allows the ones that are', () => {
    expect(check("@font-face { font-family: 'X'; src: url('https://fonts.example/x.woff2') }")).toEqual(['externalAsset'])
    expect(check("body { background-image: url('../../etc/x.png') }")).toEqual(['externalAsset'])
    expect(check("@font-face { font-family: 'X'; src: url('fonts/x.woff2') }")).toEqual([])
    expect(check("body { background-image: url('backgrounds/x.jpg') }")).toEqual([])
    expect(check('body { background-image: url(data:image/png;base64,AAAA) }')).toEqual([])
  })

  it('says nothing about a stylesheet that breaks no rule', () => {
    expect(check('body { font-family: sans-serif }')).toEqual([])
    expect(check('')).toEqual([])
  })

  it('describes every rule it can report', () => {
    const seen = new Set<RuleId>()
    for (const css of [
      '.nh-gauge__rim { fill: red }',
      '.nh-widget__body { padding: 1px }',
      '.nh-button { color: red }',
      '.nh-widget { border-image: linear-gradient(red, blue) 1 }',
      '.nh-widget, .nh-tile { background: red }',
      "body { background-image: url('https://x/y.png') }"
    ]) {
      for (const issue of checkThemeCss(css)) {
        seen.add(issue.rule)
        expect(describeIssue(issue).length).toBeGreaterThan(10)
      }
    }
    expect(seen.size).toBe(7)
  })
})

describe('the ?theme= escape hatch', () => {
  const resolveParam = (id: string | null): Theme | null =>
    id === null ? null : (BUILTIN_THEMES.find((t) => t.id === id) ?? BUILTIN_THEMES[0])

  it('lands on the default for “none”, which is what someone typing it wants', () => {
    expect(resolveParam('none')?.id).toBe('dark')
  })

  it('lands on the default for a typo rather than leaving the broken theme in place', () => {
    expect(resolveParam('drak')?.id).toBe('dark')
    expect(resolveParam('')?.id).toBe('dark')
  })

  it('honours a named built-in', () => {
    expect(resolveParam('light')?.id).toBe('light')
    expect(resolveParam('oled')?.id).toBe('oled')
  })

  it('never resolves to a custom theme, which is the whole point', () => {
    expect(resolveParam('custom-abc123')?.id).toBe('dark')
  })

  it('changes nothing when the parameter is absent', () => {
    expect(resolveParam(null)).toBe(null)
  })
})

describe('the HABPanel themes', () => {
  it('each map to a theme that exists', () => {
    for (const [habpanel, id] of Object.entries(THEME_MAP)) {
      expect(BUILTIN_THEME_IDS.has(id), `HABPanel "${habpanel}" maps to "${id}", which is not a theme`).toBe(true)
    }
  })

  it('cover all seven of them', () => {
    expect(Object.keys(THEME_MAP).sort()).toEqual(
      ['default', 'madras', 'material', 'material-dark', 'orange-tree', 'paleblue', 'translucent'].sort()
    )
  })

  it('do not all collapse onto the same theme', () => {
    expect(new Set(Object.values(THEME_MAP)).size).toBe(Object.keys(THEME_MAP).length)
  })
})

describe('theme resolution', () => {
  const custom = (id: string): Theme => ({ id, name: 'Mine', scheme: 'dark', tokens: {} })

  it('never lets a custom theme shadow a built-in', () => {
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

describe('themeCss', () => {
  it('has no stylesheet for a theme that names none', () => {
    return expect(themeCss({ id: 't', name: 'T', scheme: 'dark', tokens: {} })).resolves.toBeUndefined()
  })

  it('returns an inline stylesheet as it stands', async () => {
    expect(await themeCss({ id: 't', name: 'T', scheme: 'dark', tokens: {}, css: 'body{}' })).toBe('body{}')
  })

  it('has no stylesheet for a module named after an Object.prototype member', async () => {
    for (const key of ['constructor', 'toString', 'valueOf', '__proto__', 'hasOwnProperty']) {
      const css = await themeCss({
        id: 't',
        name: 'T',
        scheme: 'dark',
        tokens: {},
        cssModule: key as never
      })
      expect(css === undefined || typeof css === 'string').toBe(true)
      expect(typeof css).not.toBe('object')
      expect(css).toBeUndefined()
    }
  })
})

describe('the built-in status colours', () => {
  // form errors, history rows, trend arrows and a battery running low all draw in these, on the page and on
  // widgets; the defaults were chosen for dark surfaces and read at 2:1 on the light ones
  it('read at 4.5:1 or better on every theme’s page and widget surface', () => {
    const fallback = (key: string) => TOKEN_SPECS.find((s) => s.key === key)!.fallback
    const low: string[] = []
    for (const theme of BUILTIN_THEMES) {
      for (const key of ['good', 'bad']) {
        const color = theme.tokens[key] ?? fallback(key)
        for (const where of ['bg', 'surface']) {
          const ratio = contrastOf(color, theme.tokens[where], theme.tokens.bg)
          if (ratio === null || ratio < 4.5) low.push(`${theme.id} ${key} on ${where}: ${ratio?.toFixed(2)}`)
        }
      }
    }
    expect(low).toEqual([])
  })
})
