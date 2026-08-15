/**
 * The rules a theme stylesheet has to follow, checked mechanically.
 *
 * A theme stylesheet is injected after the app's own, so a rule of equal specificity wins. That
 * is what makes theming work, and it is also why a handful of ordinary-looking selectors quietly
 * break things - an `.nh-button` rule flattens the active state, a `padding` rule undoes the
 * small-cell sheds, a `fill` rule pins a gauge to one colour.
 *
 * Everything here is pure string analysis over the stylesheet text, so the same checks run in
 * three places: the unit suite (over the built-in themes), the theme editor (over what a person
 * is typing, live), and anywhere else that wants to vet a stylesheet before applying it.
 *
 * The rules are documented for theme authors in `docs/theming.md`.
 */

/**
 * Classes whose paint comes from an SVG **attribute** the widget computes - a per-instance
 * gradient, a severity colour, a live value's tint. A stylesheet `fill` or `stroke` on any of
 * them beats the attribute and pins the element to one colour, which is how a lit gauge bead
 * ends up black on a light theme and a compass cardinal ends up grey.
 *
 * A theme may style anything else about them (width, opacity, font, filter) - just not the paint.
 */
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
  'nh-compass__value',
] as const

/** Controls whose `--active` modifier shares specificity with the base class. */
const STATEFUL_CONTROLS = ['nh-button', 'nh-selection__btn'] as const

/** Path prefixes the add-on actually ships. A `url()` outside these will not load offline. */
const BUNDLED_ASSET = /^(fonts|backgrounds|icons)\//

/** One style rule, with the at-rules it is nested inside. */
export interface CssRule {
  selector: string
  body: string
  /** Preludes of the enclosing at-rules, outermost first (`['@container (min-height: 105px)']`). */
  gates: string[]
}

export type RuleId =
  | 'attributePaint'
  | 'ungatedPadding'
  | 'activeState'
  | 'borderImageRadius'
  | 'bareWidget'
  | 'newTile'
  | 'externalAsset'

export interface ThemeCssIssue {
  rule: RuleId
  /** Values for the message the caller renders. Every key is a plain string. */
  params: Record<string, string>
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Style rules in a stylesheet, descending into at-rule blocks.
 *
 * Tolerant by design: it is run against half-typed CSS in the editor, so unbalanced braces mean
 * the trailing fragment is ignored rather than an error. An at-rule whose body holds declarations
 * rather than rules (`@font-face`) contributes no rule at all.
 */
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

/** Does any selector in the list name this class, as a whole class name? */
const stylesClass = (selectors: string[], cls: string): boolean =>
  selectors.some((s) => new RegExp(`\\.${cls}(?![\\w-])`).test(s))

/**
 * Every rule this stylesheet breaks.
 *
 * `radius` is the theme's corner-radius token, which one of the rules depends on; pass the value
 * the theme will actually apply (its own, or the base fallback).
 */
export function checkThemeCss(css: string, { radius = '12px' }: { radius?: string } = {}): ThemeCssIssue[] {
  const issues: ThemeCssIssue[] = []
  const rules = parseRules(css)
  const selectors = rules.map((r) => r.selector)

  // Paint that belongs to the widget, not the stylesheet.
  for (const { selector, body } of rules) {
    if (!/(^|[;{\s])(fill|stroke)\s*:/.test(body)) continue
    for (const cls of ATTRIBUTE_PAINTED) {
      if (new RegExp(`\\.${cls}\\b`).test(selector)) issues.push({ rule: 'attributePaint', params: { selector, cls } })
    }
  }

  // Padding on a widget's own boxes has to stay out of the range where app.css sheds it, or the
  // clipping those sheds prevent comes straight back in short and narrow cells.
  for (const { selector, body, gates } of rules) {
    if (!/(^|[;{\s])padding(-\w+)?\s*:/.test(body)) continue
    if (!/nh-widget__(label|body)/.test(selector)) continue
    if (!gates.some((g) => g.startsWith('@container'))) issues.push({ rule: 'ungatedPadding', params: { selector } })
  }

  // A BEM modifier shares specificity with its base class, so styling the base flattens the state.
  for (const control of STATEFUL_CONTROLS) {
    const base = selectors.filter((s) => !s.includes(`${control}--active`))
    if (!stylesClass(base, control)) continue
    if (!selectors.some((s) => s.includes(`${control}--active`))) {
      issues.push({ rule: 'activeState', params: { control } })
    }
  }

  // A border gradient squares off rounded corners; the two cannot be combined. The value is read
  // out rather than matched with a lookahead, which `\s*` before it would let backtrack past.
  const paintsBorderImage = rules.some((r) =>
    [...r.body.matchAll(/border-image\s*:([^;]*)/g)].some((m) => m[1].trim() !== 'none' && m[1].trim() !== '')
  )
  if (paintsBorderImage && radius.trim() !== '0px' && radius.trim() !== '0') {
    issues.push({ rule: 'borderImageRadius', params: { radius } })
  }

  // A blanket tile rule catches the two tiles that asked not to be one. A theme may genuinely
  // want to panel the bare widgets - it just has to say so, so the deviation is on record.
  if (stylesClass(selectors, 'nh-widget') && stylesClass(selectors, 'nh-tile')) {
    if (!selectors.some((s) => s.includes('nh-widget--bare')) && !css.includes('nh-theme-allow: bare-panelled')) {
      issues.push({ rule: 'bareWidget', params: {} })
    }
    if (!selectors.some((s) => s.includes('nh-tile--new'))) issues.push({ rule: 'newTile', params: {} })
  }

  // An asset the add-on does not ship will not load on a server with no route to the internet,
  // which is most of them.
  for (const m of stripComments(css).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const url = m[1].trim()
    if (url.startsWith('data:')) continue
    if (!BUNDLED_ASSET.test(url)) issues.push({ rule: 'externalAsset', params: { url } })
  }

  return issues
}

/**
 * A developer-facing description, for test failures and logs.
 *
 * The theme editor does not use this: it renders each rule through `t()` with wording aimed at
 * the person writing the stylesheet, in their own language.
 */
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
