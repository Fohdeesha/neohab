/**
 * Theming.
 *
 * A theme is a named set of design tokens applied as CSS custom properties on the document root,
 * optionally with a stylesheet of its own for looks tokens cannot express (fonts, widget-frame
 * structure). Widgets and chrome only ever read tokens, so setting one restyles everything.
 *
 * The token contract lives in `tokens.ts` - that list is what the theme editor builds itself from
 * and what `docs/theming.md` documents. The built-in stylesheets live one per module under `css/`
 * and are loaded on demand, so a browser downloads the stylesheet for the theme it is showing and
 * not the other five.
 *
 * Custom themes are stored on the server (`theme:<id>` components) and carry their stylesheet
 * inline. The active theme is cached locally, stylesheet included, and applied before first paint.
 */
import { readableInk } from './contrast'
import { isUsableTokenValue, THEME_TOKENS, type ThemeTokens } from './tokens'
import { urlThemeId } from './urlTheme'
import { lookup } from '../model/lookup'

export { THEME_TOKENS, TOKEN_GROUPS, TOKEN_SPECS, tokensInGroup, type ThemeTokens, type TokenSpec } from './tokens'

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
  // Through `lookup` because `cssModule` comes off a stored theme component: a bare index
  // answers with an Object.prototype member, the `!load` guard does not fire for a function,
  // and `await load()` then hands back `Object(...)` to be used as a stylesheet.
  const load = lookup(CSS_MODULES, theme.cssModule)
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
  },

  /* ------------------------- the rest of HABPanel's set -------------------------
     Ports of the themes HABPanel shipped, so a dashboard imported from it arrives
     looking roughly like it did. Each is read from that theme's own CSS variables:
     --body-bg -> bg, --box-bg -> surface, --primary-color -> primary,
     --widget-text-color -> text, --body-color -> text-dim, and its radius and
     shadow. HABPanel had no notion of a raised surface or a border colour, so
     those two are chosen to sit with the rest.

     They are ports, not clones: where a colour fell below a readable contrast
     ratio it was moved the smallest distance that fixes it, because the editor
     reports contrast and a built-in should not be the example that fails. Those
     adjustments are noted individually. */
  {
    id: 'material',
    name: 'Material (HABPanel)',
    scheme: 'light',
    tokens: {
      bg: '#f5f5f5',
      surface: '#ffffff',
      'surface-2': '#eceff1',
      border: '#dcdfe3',
      text: '#333333',
      'text-dim': '#616161',
      primary: '#ff3333',
      brand: '#ff3333',
      radius: '0px',
      shadow: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.14)',
    },
  },
  {
    id: 'material-dark',
    name: 'Material dark (HABPanel)',
    scheme: 'dark',
    tokens: {
      bg: '#303030',
      surface: '#424242',
      'surface-2': '#4f4f4f',
      border: '#565656',
      text: '#ffffff',
      'text-dim': '#b7b7b7',
      primary: '#0db9f0',
      brand: '#0db9f0',
      radius: '2px',
      shadow: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.14)',
    },
  },
  {
    id: 'paleblue',
    name: 'Pale blue (HABPanel)',
    scheme: 'dark',
    tokens: {
      bg: '#000000',
      surface: '#001428',
      // darker than a step above the surface would normally be, so the muted text
      // this theme is built on still reads on a button
      'surface-2': '#04203a',
      border: '#123a52',
      text: '#708c9d',
      // HABPanel's own #647f93 sat at 4.4:1 on the surface; lifted to clear 4.5
      'text-dim': '#7590a0',
      primary: '#13738f',
      brand: '#13738f',
      radius: '8px',
      shadow: 'none',
    },
  },
  {
    id: 'translucent',
    name: 'Translucent (HABPanel)',
    scheme: 'dark',
    tokens: {
      bg: '#072d4b',
      // the point of this one: widgets are smoked glass over the page, so a
      // background image reads through them
      surface: 'rgba(0, 0, 0, 0.6)',
      'surface-2': 'rgba(0, 0, 0, 0.35)',
      border: 'rgba(255, 255, 255, 0.18)',
      text: '#ddeeff',
      'text-dim': '#a8bccc',
      primary: '#0db9f0',
      brand: '#0db9f0',
      radius: '0px',
      shadow: 'none',
    },
  },
  {
    id: 'madras',
    name: 'Madras (HABPanel)',
    scheme: 'light',
    tokens: {
      // HABPanel left the page transparent, expecting a background image behind it.
      // A theme has to name a colour, so this is the warm paper its palette implies;
      // set a background image and the translucent surfaces still let it through.
      bg: '#e9e2d6',
      surface: 'rgba(255, 255, 255, 0.9)',
      'surface-2': 'rgba(255, 255, 255, 0.72)',
      border: 'rgba(25, 23, 22, 0.18)',
      text: '#191716',
      'text-dim': '#5b5651',
      // HABPanel's hsl(29, 100%, 50%) is 2.6:1 on near-white; darkened to clear the
      // 3:1 that large text needs, which keeps the orange without losing the reading
      primary: '#d96b00',
      brand: '#d96b00',
      radius: '3px',
      shadow: '0 1px 8px rgba(0, 0, 0, 0.5)',
    },
  },
  {
    id: 'orange-tree',
    name: 'Orange Tree (HABPanel)',
    scheme: 'dark',
    tokens: {
      bg: '#09120f',
      surface: '#151d19',
      'surface-2': '#1f2a24',
      border: '#2a3730',
      text: '#a4a4a4',
      // HABPanel's #7d7d7d sat at 4.2:1 on the surface; lifted to clear 4.5
      'text-dim': '#8a8a8a',
      primary: '#ff7b00',
      brand: '#ff7b00',
      radius: '3px',
      shadow: '0 1px 8px rgba(0, 0, 0, 0.8)',
    },
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
 * Token values come from stored configuration, which is untrusted - a rejected value is simply
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

/**
 * Apply the last-used theme before first paint (called from main.tsx).
 *
 * `?theme=` wins here, and it has to: the cached theme is exactly what a broken one would be
 * reapplied from, so an escape hatch that only took effect after the app had booted would be
 * painting over the problem rather than avoiding it.
 */
export function applyCachedTheme(): void {
  const forced = urlThemeOverride()
  if (forced) {
    applyTheme(forced)
    return
  }
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) applyTheme(JSON.parse(raw) as Theme)
  } catch {
    /* fall back to stylesheet defaults */
  }
}

/**
 * The theme a `?theme=` parameter forces for this page load, if any.
 *
 * An id that is not a built-in - `none`, or a typo - resolves to the default, which is exactly
 * what someone typing "none" into the address bar wants. Custom themes are deliberately not
 * honoured: they live in the server configuration, which has not loaded when the pre-paint path
 * asks, and a hatch that depends on the configuration is no hatch at all.
 */
export function urlThemeOverride(): Theme | null {
  if (urlThemeId === null) return null
  return BUILTIN_THEMES.find((t) => t.id === urlThemeId) ?? BUILTIN_THEMES[0]
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
