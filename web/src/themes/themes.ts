/**
 * Theming.
 *
 * A theme is a named set of design tokens applied as CSS custom properties on the document root,
 * optionally with a stylesheet of its own for looks tokens cannot express (fonts, widget-frame
 * structure). Widgets and chrome only ever read tokens, so setting one restyles everything.
 *
 * The token contract lives in `tokens.ts` — that list is what the theme editor builds itself from
 * and what `docs/theming.md` documents. The built-in stylesheets live one per module under `css/`
 * and are loaded on demand, so a browser downloads the stylesheet for the theme it is showing and
 * not the other five.
 *
 * Custom themes are stored on the server (`theme:<id>` components) and carry their stylesheet
 * inline. The active theme is cached locally, stylesheet included, and applied before first paint.
 */
import { readableInk } from './contrast'
import { isUsableTokenValue, THEME_TOKENS, type ThemeTokens } from './tokens'

export { COLOR_TOKENS, THEME_TOKENS, TOKEN_GROUPS, TOKEN_SPECS, tokensInGroup, type ThemeTokens, type TokenSpec } from './tokens'

/** Built-in stylesheets, by the id a theme references them with. */
const CSS_MODULES = {
  swiss: () => import('./css/swiss').then((m) => m.SWISS_CSS),
  ember: () => import('./css/ember').then((m) => m.EMBER_CSS),
  lcd: () => import('./css/lcd').then((m) => m.LCD_CSS),
  ops: () => import('./css/ops').then((m) => m.OPS_CSS),
  assembly: () => import('./css/assembly').then((m) => m.ASSEMBLY_CSS),
}

export type BuiltinCssId = keyof typeof CSS_MODULES

export interface Theme {
  id: string
  name: string
  scheme: 'dark' | 'light'
  tokens: ThemeTokens
  /**
   * Stylesheet applied with the theme. Custom themes carry it inline; this is also what the
   * local cache stores for a built-in, so a repeat visit needs no module load before first paint.
   */
  css?: string
  /**
   * A built-in's stylesheet, named rather than inlined so it is fetched only when the theme is
   * actually used. Ignored when `css` is present.
   */
  cssModule?: BuiltinCssId
}

/** The stylesheet a theme applies, loading it if it is a built-in that has not been fetched. */
export async function themeCss(theme: Theme): Promise<string | undefined> {
  if (typeof theme.css === 'string') return theme.css
  if (!theme.cssModule) return undefined
  const load = CSS_MODULES[theme.cssModule]
  if (!load) return undefined
  try {
    return await load()
  } catch {
    // The chunk could not be fetched (offline, mid-deploy). Tokens are already applied, so the
    // theme's colours are right and only its structural styling is missing.
    return undefined
  }
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'dark',
    name: 'neohab Dark',
    scheme: 'dark',
    tokens: {
      bg: '#0f1317',
      surface: '#1a212a',
      'surface-2': '#222c37',
      border: '#2c3844',
      text: '#dde3ea',
      'text-dim': '#8a94a0',
      primary: '#38b6ff',
      brand: '#e35a2b',
      radius: '12px',
    },
  },
  {
    id: 'light',
    name: 'neohab Light',
    scheme: 'light',
    tokens: {
      bg: '#f1f3f6',
      surface: '#ffffff',
      'surface-2': '#e8ecf1',
      border: '#d3dae2',
      text: '#1d242c',
      'text-dim': '#5d6874',
      primary: '#0b78c2',
      brand: '#d94e20',
      radius: '12px',
    },
  },
  {
    id: 'oled',
    name: 'OLED Black',
    scheme: 'dark',
    tokens: {
      bg: '#000000',
      surface: '#0b0f13',
      'surface-2': '#141a21',
      border: '#20272f',
      text: '#d5dbe2',
      'text-dim': '#7d8894',
      primary: '#38b6ff',
      brand: '#e35a2b',
      radius: '12px',
    },
  },
  {
    id: 'swiss',
    name: 'Swiss Sheet',
    scheme: 'dark',
    tokens: {
      bg: '#0a0a0a',
      surface: '#141414',
      'surface-2': '#1e1e1e',
      border: '#2e2e2e',
      text: '#f2f2f2',
      'text-dim': '#9a9a9a',
      primary: '#e2382a',
      brand: '#e2382a',
      radius: '0px',
      shadow: 'none',
      // white on this red is the reference's own choice, so it is pinned rather than derived
      'accent-ink': '#ffffff',
    },
    cssModule: 'swiss',
  },
  {
    id: 'swiss-light',
    name: 'Swiss Sheet Light',
    scheme: 'light',
    tokens: {
      bg: '#ffffff',
      surface: '#ffffff',
      'surface-2': '#f0f0f0',
      border: '#d6d6d6',
      text: '#111111',
      'text-dim': '#666666',
      primary: '#d02b1e',
      brand: '#d02b1e',
      radius: '0px',
      shadow: 'none',
      // white on this red is the reference's own choice, so it is pinned rather than derived
      'accent-ink': '#ffffff',
    },
    cssModule: 'swiss',
  },
  {
    id: 'ember',
    name: 'Ember',
    scheme: 'dark',
    tokens: {
      bg: '#1a222d',
      surface: '#212b38',
      'surface-2': '#2a3646',
      border: '#2f3c4b',
      text: '#eef3f8',
      'text-dim': '#8b9aab',
      primary: '#f2681f',
      brand: '#f2681f',
      radius: '10px',
      // the accent leads the chart palette, so a single-series chart is an orange trace
      'chart-1': '#f2681f',
      'accent-ink': '#ffffff',
    },
    cssModule: 'ember',
  },
  {
    id: 'lcd',
    name: 'LCD Console',
    scheme: 'dark',
    tokens: {
      bg: '#000000',
      surface: '#0a1116',
      'surface-2': '#12202a',
      border: '#173038',
      text: '#dff4fd',
      'text-dim': '#6e93a5',
      primary: '#3fd2f6',
      brand: '#3fd2f6',
      radius: '0px',
      shadow: 'none',
      // the console's four neons
      'chart-1': '#3fd2f6',
      'chart-2': '#3bf07a',
      'chart-3': '#ff45d8',
      'chart-4': '#ffd23c',
      // the console plates are bright neon: dark glyphs on them, as on the real thing
      'accent-ink': '#000000',
    },
    cssModule: 'lcd',
  },
  {
    id: 'ops',
    name: 'Operations',
    scheme: 'dark',
    tokens: {
      /* not flat black: the page is lit from above by the stylesheet, and this is the colour
         its darkest corner settles to */
      bg: '#04070d',
      surface: '#070c16',
      'surface-2': '#101c33',
      border: '#1e3a6b',
      text: '#ffffff',
      'text-dim': '#8ba3c4',
      primary: '#3f7fe0',
      brand: '#3f7fe0',
      radius: '0px',
      shadow: 'none',
      // the board's semantics: a reading that moved the good way, and one that moved the other
      good: '#a3ce4a',
      bad: '#ef2b34',
      // the chart palette leads with the board's own green, then its blue
      'chart-1': '#a3ce4a',
      'chart-2': '#3f7fe0',
      'chart-3': '#ef2b34',
      'chart-4': '#d8c34a',
      // the instrument's own light: rim shading and the glow inside a gauge face
      'rim-hi': 'color-mix(in srgb, var(--nh-primary) 85%, #ffffff)',
      'rim-lo': 'color-mix(in srgb, var(--nh-primary) 42%, #000000)',
      'face-hi': 'color-mix(in srgb, var(--nh-primary) 13%, transparent)',
      'face-lo': 'color-mix(in srgb, var(--nh-primary) 3%, transparent)',
      'accent-ink': '#ffffff',
    },
    cssModule: 'ops',
  },
  {
    id: 'assembly',
    name: 'Assembly',
    scheme: 'dark',
    tokens: {
      /* the darkest corner of the stylesheet's lit green room */
      bg: '#0b110e',
      surface: '#18221a',
      'surface-2': '#223026',
      border: '#2b3d31',
      text: '#e9f2ec',
      'text-dim': '#8ba394',
      primary: '#40d364',
      brand: '#40d364',
      radius: '14px',
      shadow: 'none',
      good: '#40d364',
      bad: '#ef5350',
      'chart-1': '#40d364',
      'chart-2': '#f0813c',
      'chart-3': '#3c62f0',
      // light the solid-arc gauges: a bright film at the value tip, a sunk one at the start
      'band-light': '0.5',
      'band-shade': '0.28',
      // the vivid green is light enough that white would wash out on it
      'accent-ink': '#06130a',
    },
    cssModule: 'assembly',
  },
  {
    id: 'aqua',
    name: 'Aqua (HABPanel classic)',
    scheme: 'dark',
    tokens: {
      bg: '#000000',
      surface: '#223344',
      'surface-2': '#2c4258',
      border: '#33475c',
      text: '#cccccc',
      'text-dim': '#8899aa',
      primary: '#0db9f0',
      brand: '#0db9f0',
      radius: '2px',
    },
    cssModule: undefined,
  },
]

/** Ids that belong to a built-in and may not be taken by a custom theme. */
export const BUILTIN_THEME_IDS: ReadonlySet<string> = new Set(BUILTIN_THEMES.map((t) => t.id))

const CACHE_KEY = 'neohab:themeCache'
const CSS_STYLE_ID = 'nh-theme-css'
/** The base accent and brand, for deriving ink when a theme leaves them alone. */
const BASE_PRIMARY = '#38b6ff'
const BASE_BRAND = '#e35a2b'

/**
 * Guards against a stylesheet arriving after the theme changed again: a slow module load for a
 * theme the user has already switched away from must not paint over the new one.
 */
let applyGeneration = 0

function injectCss(css: string | undefined): void {
  const existing = document.getElementById(CSS_STYLE_ID)
  if (!css) {
    existing?.remove()
    return
  }
  const el = existing ?? document.createElement('style')
  if (!existing) {
    el.id = CSS_STYLE_ID
    // Appended to <head> so it cascades AFTER the app stylesheet; that ordering is what lets a
    // theme override a base rule of equal specificity, and every theme depends on it.
    document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}

/**
 * Apply a theme: tokens first (synchronously, so colours are never wrong), then its stylesheet.
 *
 * Token values come from stored configuration, which is untrusted — a rejected value is simply
 * dropped so the base stylesheet's own value applies, rather than writing something odd into the
 * document. `accent-ink` is derived from the accent unless the theme pins it, which is what keeps
 * text on a filled tile readable whatever colour the accent is.
 */
export function applyTheme(theme: Theme): void {
  const gen = ++applyGeneration
  const root = document.documentElement

  for (const key of THEME_TOKENS) {
    const value = theme.tokens[key]
    if (isUsableTokenValue(value)) root.style.setProperty('--nh-' + key, value)
    else root.style.removeProperty('--nh-' + key)
  }

  // Ink on top of the accent: the theme's own choice, else whichever of white/near-black can
  // actually be read on it. An accent we cannot parse (a gradient, a var) keeps white. The same
  // for the brand colour, which primary buttons are painted in.
  const pinned = theme.tokens['accent-ink']
  const ink = isUsableTokenValue(pinned) ? pinned : (readableInk(theme.tokens.primary ?? BASE_PRIMARY) ?? '#ffffff')
  root.style.setProperty('--nh-accent-ink', ink)
  root.style.setProperty('--nh-brand-ink', readableInk(theme.tokens.brand ?? BASE_BRAND) ?? '#ffffff')

  root.style.colorScheme = theme.scheme

  if (typeof theme.css === 'string' || !theme.cssModule) {
    injectCss(theme.css)
    return
  }
  // A built-in's stylesheet is a separate chunk. Clear the previous theme's first: showing one
  // theme's structure under another's colours is worse than a frame of plain layout.
  injectCss(undefined)
  void themeCss(theme).then((css) => {
    if (gen === applyGeneration) injectCss(css)
  })
}

/**
 * Remember the applied theme for the next page load, stylesheet resolved so the pre-paint path
 * needs no module load. Cosmetic: a failure here costs a flash, nothing else.
 */
export async function cacheTheme(theme: Theme): Promise<void> {
  try {
    const css = await themeCss(theme)
    const resolved: Theme = { ...theme, css, cssModule: undefined }
    localStorage.setItem(CACHE_KEY, JSON.stringify(resolved))
  } catch {
    /* storage full/blocked, or the chunk did not load - purely cosmetic */
  }
}

/** Apply the last-used theme before first paint (called from main.tsx). */
export function applyCachedTheme(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) applyTheme(JSON.parse(raw) as Theme)
  } catch {
    /* fall back to stylesheet defaults */
  }
}

/**
 * The theme an id names. A built-in always wins over a custom theme claiming the same id: the
 * built-ins are what every install has, and a shared theme file that happened to be called
 * `dark` must not silently replace the one people know. Unknown ids fall back to the default.
 */
export function resolveTheme(id: string | undefined, customThemes: Theme[]): Theme {
  return (
    BUILTIN_THEMES.find((t) => t.id === id) ??
    customThemes.find((t) => t.id === id) ??
    BUILTIN_THEMES[0]
  )
}

/** Built-ins first, then custom themes that do not shadow one, for the theme picker. */
export function listThemes(customThemes: Theme[]): Theme[] {
  return [...BUILTIN_THEMES, ...customThemes.filter((t) => !BUILTIN_THEME_IDS.has(t.id))]
}
