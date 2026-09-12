// a theme sheet is injected after the app's own, so equal specificity means it wins - these are the rules that
// stop it winning too much

// these take their paint from an SVG attribute, so any stylesheet fill/stroke would beat it
export const ATTRIBUTE_PAINTED = [
  'nh-gauge__rim',
  'nh-gauge__band',
  'nh-gauge__bandlight',
  'nh-gauge__bandshade',
  'nh-gauge__ledlit',
  'nh-gauge__blklit',
  'nh-gauge__claybody',
  'nh-gauge__tklit',
  'nh-compass__cardinal',
  'nh-compass__value'
] as const

// the button's base class carries the layout and .nh-button--plain the theme's own surface, so a sheet
// restyling either of them owes an --active rule
const STATEFUL_CONTROLS = [
  { control: 'nh-button', base: /\.nh-button(--plain)?(?![\w-])/, active: 'nh-button--active' },
  { control: 'nh-selection__btn', base: /\.nh-selection__btn(?![\w-])/, active: 'nh-selection__btn--active' }
] as const

const BUNDLED_ASSET = /^(fonts|backgrounds|icons)\//

export interface CssRule {
  selector: string
  body: string
  gates: string[]
}

export type RuleId = 'attributePaint' | 'ungatedPadding' | 'activeState' | 'borderImageRadius' | 'bareWidget' | 'newTile' | 'externalAsset'

export interface ThemeCssIssue {
  rule: RuleId
  params: Record<string, string>
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

export function parseRules(css: string): CssRule[] {
  const out: CssRule[] = []

  const scan = (text: string, gates: string[]): void => {
    let depth = 0
    let start = 0
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        depth++
      } else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const block = text.slice(start, i + 1)
          const brace = block.indexOf('{')
          const selector = block.slice(0, brace).trim()
          const body = block.slice(brace + 1, -1)
          if (selector.startsWith('@')) scan(body, [...gates, selector])
          else if (body.includes('{')) scan(body, gates)
          else if (selector) out.push({ selector, body, gates })
          start = i + 1
        }
      }
    }
  }

  scan(stripComments(css), [])
  return out
}

const stylesClass = (selectors: string[], cls: string): boolean => selectors.some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s))

export function checkThemeCss(css: string, { radius = '12px' }: { radius?: string } = {}): ThemeCssIssue[] {
  const issues: ThemeCssIssue[] = []
  const rules = parseRules(css)
  const selectors = rules.map((r) => r.selector)

  for (const { selector, body } of rules) {
    if (!/(^|[;{\s])(fill|stroke)\s*:/.test(body)) continue
    for (const cls of ATTRIBUTE_PAINTED) {
      if (new RegExp(`\\.${cls}\\b`).test(selector)) issues.push({ rule: 'attributePaint', params: { selector, cls } })
    }
  }

  for (const { selector, body, gates } of rules) {
    if (!/(^|[;{\s])padding(-\w+)?\s*:/.test(body)) continue
    if (!/nh-widget__(label|body)/.test(selector)) continue
    if (!gates.some((g) => g.startsWith('@container'))) issues.push({ rule: 'ungatedPadding', params: { selector } })
  }

  for (const { control, base, active } of STATEFUL_CONTROLS) {
    if (!selectors.some((s) => !s.includes(active) && base.test(s))) continue
    if (!selectors.some((s) => s.includes(active))) issues.push({ rule: 'activeState', params: { control } })
  }

  const paintsBorderImage = rules.some((r) =>
    [...r.body.matchAll(/border-image\s*:([^;]*)/g)].some((m) => m[1].trim() !== 'none' && m[1].trim() !== '')
  )
  if (paintsBorderImage && radius.trim() !== '0px' && radius.trim() !== '0') {
    issues.push({ rule: 'borderImageRadius', params: { radius } })
  }

  if (stylesClass(selectors, 'nh-widget') && stylesClass(selectors, 'nh-tile')) {
    if (!selectors.some((s) => s.includes('nh-widget--bare')) && !css.includes('nh-theme-allow: bare-panelled')) {
      issues.push({ rule: 'bareWidget', params: {} })
    }
    if (!selectors.some((s) => s.includes('nh-tile--new'))) issues.push({ rule: 'newTile', params: {} })
  }

  for (const m of stripComments(css).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const url = m[1].trim()
    if (url.startsWith('data:')) continue
    if (!BUNDLED_ASSET.test(url)) issues.push({ rule: 'externalAsset', params: { url } })
  }

  return issues
}

export function describeIssue({ rule, params }: ThemeCssIssue): string {
  switch (rule) {
    case 'attributePaint':
      return `"${params.selector}" sets fill/stroke on .${params.cls}, which is painted by attribute`
    case 'ungatedPadding':
      return `"${params.selector}" sets padding outside a @container gate`
    case 'activeState':
      return `restyles .${params.control} but not .${params.control}--active`
    case 'borderImageRadius':
      return `uses border-image with a radius of ${params.radius} (it must be 0px)`
    case 'bareWidget':
      return 'paints every widget but never restores .nh-widget--bare (declare "nh-theme-allow: bare-panelled" in the stylesheet if that is deliberate)'
    case 'newTile':
      return 'paints every tile but never restores .nh-tile--new'
    case 'externalAsset':
      return `references "${params.url}", which is not a bundled path`
  }
}
