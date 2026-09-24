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

// state classes the app styles with a few properties only; a sheet setting one of those on the base class
// cancels the state, and one setting anything else does no harm
const STATE_PROPERTIES = [
  { control: 'nh-iconbtn', state: 'nh-iconbtn--live', props: ['color'] },
  { control: 'nh-chip', state: 'nh-chip--on', props: ['background', 'background-color', 'border', 'border-color', 'color'] },
  { control: 'nh-chip', state: 'nh-chip--action', props: ['border', 'border-style'] }
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

// the index of the quote or bracket that closes the one at `i`, or the end of the text
function skipTo(text: string, i: number, close: string): number {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++
    else if (text[j] === close) return j
  }
  return text.length
}

// Braces inside a string or an unquoted url() are not structure, a statement at-rule like @import ends at its
// semicolon, and a stray } closes nothing. Each of those used to throw the scan out of step, and every rule
// after it went unchecked.
export function parseRules(css: string): CssRule[] {
  const out: CssRule[] = []

  const scan = (text: string, gates: string[]): void => {
    let depth = 0
    let start = 0
    let open = -1
    let nested = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (c === '"' || c === "'") {
        i = skipTo(text, i, c)
      } else if ((c === 'u' || c === 'U') && /^url\(\s*[^'"\s]/i.test(text.slice(i, i + 6))) {
        i = skipTo(text, i + 3, ')')
      } else if (c === '{') {
        if (depth === 0) {
          open = i
          nested = false
        } else nested = true
        depth++
      } else if (c === '}') {
        if (depth === 0) {
          start = i + 1
          continue
        }
        depth--
        if (depth === 0) {
          const selector = text.slice(start, open).trim()
          const body = text.slice(open + 1, i)
          if (selector.startsWith('@')) scan(body, [...gates, selector])
          else if (nested) scan(body, gates)
          else if (selector) out.push({ selector, body, gates })
          start = i + 1
        }
      } else if (c === ';' && depth === 0) {
        start = i + 1
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
    if (!selectors.some((s) => s.includes(active))) issues.push({ rule: 'activeState', params: { control, state: active } })
  }

  for (const { control, state, props } of STATE_PROPERTIES) {
    const base = new RegExp(`\\.${control}(?![\\w-])`)
    const sets = new RegExp(`(^|[;{\\s])(${props.join('|')})\\s*:`)
    const cancels = rules.some((r) => r.selector.split(',').some((s) => base.test(s) && !s.includes(state)) && sets.test(r.body))
    if (cancels && !selectors.some((s) => s.includes(state))) issues.push({ rule: 'activeState', params: { control, state } })
  }

  const paintsBorderImage = rules.some((r) =>
    [...r.body.matchAll(/border-image\s*:([^;]*)/g)].some((m) => m[1].trim() !== 'none' && m[1].trim() !== '')
  )
  if (paintsBorderImage && radius.trim() !== '0px' && radius.trim() !== '0') {
    issues.push({ rule: 'borderImageRadius', params: { radius } })
  }

  // .nh-widget--bare clears the card's background, border and shadow at the base class's specificity, so a
  // sheet giving every widget any of those takes it away from the ones that asked for none
  const cardPaint = /(^|[;{\s])(background(-color|-image)?|border(-color)?|box-shadow)\s*:/
  const paintsCards = rules.some((r) => r.selector.split(',').some((s) => /\.nh-widget(?![\w-])/.test(s)) && cardPaint.test(r.body))
  if (paintsCards && !selectors.some((s) => s.includes('nh-widget--bare')) && !css.includes('nh-theme-allow: bare-panelled')) {
    issues.push({ rule: 'bareWidget', params: {} })
  }
  if (stylesClass(selectors, 'nh-widget') && stylesClass(selectors, 'nh-tile') && !selectors.some((s) => s.includes('nh-tile--new'))) {
    issues.push({ rule: 'newTile', params: {} })
  }

  // @import takes a bare string as well as url(), and either one fetches from wherever it names
  const bare = /@import\s+(['"])(.*?)\1/g
  for (const m of [...stripComments(css).matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g), ...stripComments(css).matchAll(bare)]) {
    const url = (m[2] ?? m[1]).trim()
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
      return `restyles .${params.control} but not .${params.state}`
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
