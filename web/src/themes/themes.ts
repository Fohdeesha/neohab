import { readableInk } from './contrast'
import { isUsableTokenValue, THEME_TOKENS, type ThemeTokens } from './tokens'
import { urlThemeId } from './urlTheme'
import { lookup } from '../model/lookup'

export { THEME_TOKENS, TOKEN_GROUPS, TOKEN_SPECS, tokensInGroup, type ThemeTokens, type TokenSpec } from './tokens'

const CSS_MODULES = {
  swiss: () => import('./css/swiss').then((m) => m.SWISS_CSS),
  ember: () => import('./css/ember').then((m) => m.EMBER_CSS),
  lcd: () => import('./css/lcd').then((m) => m.LCD_CSS),
  ops: () => import('./css/ops').then((m) => m.OPS_CSS),
  assembly: () => import('./css/assembly').then((m) => m.ASSEMBLY_CSS)
}

export type BuiltinCssId = keyof typeof CSS_MODULES

export interface Theme {
  id: string
  name: string
  scheme: 'dark' | 'light'
  tokens: ThemeTokens
  css?: string
  cssModule?: BuiltinCssId
}

export async function themeCss(theme: Theme): Promise<string | undefined> {
  if (typeof theme.css === 'string') return theme.css
  if (!theme.cssModule) return undefined
  // through lookup: cssModule comes off a stored theme component
  const load = lookup(CSS_MODULES, theme.cssModule)
  if (!load) return undefined
  try {
    return await load()
  } catch {
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
      radius: '12px'
    }
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
      radius: '12px'
    }
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
      radius: '12px'
    }
  },
  {
    id: 'swiss',
    name: 'Swiss Sheet',
    scheme: 'dark',
    tokens: {
      bg: '#000000',
      surface: '#161616',
      'surface-2': '#2b2b2b',
      border: '#3a3a3a',
      text: '#f2f2f2',
      'text-dim': '#8c9199',
      primary: '#f2f2f2',
      brand: '#e2382a',
      radius: '0px',
      shadow: 'none',
      good: '#f2f2f2',
      bad: '#e2382a',
      'chart-1': '#f2f2f2',
      'chart-2': '#e2382a',
      'chart-3': '#9aa1ab'
    },
    cssModule: 'swiss'
  },
  {
    id: 'swiss-light',
    name: 'Swiss Sheet Light',
    scheme: 'light',
    tokens: {
      bg: '#ffffff',
      surface: '#f4f4f4',
      'surface-2': '#e4e4e4',
      border: '#d4d4d4',
      text: '#111111',
      'text-dim': '#6b7178',
      primary: '#111111',
      brand: '#d02b1e',
      radius: '0px',
      shadow: 'none',
      good: '#111111',
      bad: '#d02b1e',
      'chart-1': '#111111',
      'chart-2': '#d02b1e',
      'chart-3': '#9aa1ab'
    },
    cssModule: 'swiss'
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
      'chart-1': '#f2681f',
      'accent-ink': '#ffffff'
    },
    cssModule: 'ember'
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
      'chart-1': '#3fd2f6',
      'chart-2': '#3bf07a',
      'chart-3': '#ff45d8',
      'chart-4': '#ffd23c',
      'accent-ink': '#000000'
    },
    cssModule: 'lcd'
  },
  {
    id: 'ops',
    name: 'Operations',
    scheme: 'dark',
    tokens: {
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
      good: '#a3ce4a',
      bad: '#ef2b34',
      'chart-1': '#a3ce4a',
      'chart-2': '#3f7fe0',
      'chart-3': '#ef2b34',
      'chart-4': '#d8c34a',
      'rim-hi': 'color-mix(in srgb, var(--nh-primary) 85%, #ffffff)',
      'rim-lo': 'color-mix(in srgb, var(--nh-primary) 42%, #000000)',
      'face-hi': 'color-mix(in srgb, var(--nh-primary) 13%, transparent)',
      'face-lo': 'color-mix(in srgb, var(--nh-primary) 3%, transparent)',
      'accent-ink': '#ffffff'
    },
    cssModule: 'ops'
  },
  {
    id: 'assembly',
    name: 'Assembly',
    scheme: 'dark',
    tokens: {
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
      'band-light': '0.5',
      'band-shade': '0.28',
      'accent-ink': '#06130a'
    },
    cssModule: 'assembly'
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
      radius: '2px'
    }
  },

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
      shadow: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.14)'
    }
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
      shadow: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.14)'
    }
  },
  {
    id: 'paleblue',
    name: 'Pale blue (HABPanel)',
    scheme: 'dark',
    tokens: {
      bg: '#000000',
      surface: '#001428',
      'surface-2': '#04203a',
      border: '#123a52',
      text: '#708c9d',
      'text-dim': '#7590a0',
      primary: '#13738f',
      brand: '#13738f',
      radius: '8px',
      shadow: 'none'
    }
  },
  {
    id: 'translucent',
    name: 'Translucent (HABPanel)',
    scheme: 'dark',
    tokens: {
      bg: '#072d4b',
      surface: 'rgba(0, 0, 0, 0.6)',
      'surface-2': 'rgba(0, 0, 0, 0.35)',
      border: 'rgba(255, 255, 255, 0.18)',
      text: '#ddeeff',
      'text-dim': '#a8bccc',
      primary: '#0db9f0',
      brand: '#0db9f0',
      radius: '0px',
      shadow: 'none'
    }
  },
  {
    id: 'madras',
    name: 'Madras (HABPanel)',
    scheme: 'light',
    tokens: {
      bg: '#e9e2d6',
      surface: 'rgba(255, 255, 255, 0.9)',
      'surface-2': 'rgba(255, 255, 255, 0.72)',
      border: 'rgba(25, 23, 22, 0.18)',
      text: '#191716',
      'text-dim': '#5b5651',
      primary: '#d96b00',
      brand: '#d96b00',
      radius: '3px',
      shadow: '0 1px 8px rgba(0, 0, 0, 0.5)'
    }
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
      'text-dim': '#8a8a8a',
      primary: '#ff7b00',
      brand: '#ff7b00',
      radius: '3px',
      shadow: '0 1px 8px rgba(0, 0, 0, 0.8)'
    }
  }
]

export const BUILTIN_THEME_IDS: ReadonlySet<string> = new Set(BUILTIN_THEMES.map((t) => t.id))

const CACHE_KEY = 'neohab:themeCache'
const CSS_STYLE_ID = 'nh-theme-css'
const BASE_PRIMARY = '#38b6ff'
const BASE_BRAND = '#e35a2b'

// guards against a stylesheet arriving after the theme changed again
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
    // appended to <head> so it cascades AFTER the app stylesheet - that ordering is what lets a theme override a
    // base rule of equal specificity
    document.head.appendChild(el)
  }
  if (el.textContent !== css) el.textContent = css
}

export function applyTheme(theme: Theme): void {
  const gen = ++applyGeneration
  const root = document.documentElement

  for (const key of THEME_TOKENS) {
    const value = theme.tokens[key]
    if (isUsableTokenValue(value)) root.style.setProperty('--nh-' + key, value)
    else root.style.removeProperty('--nh-' + key)
  }

  const pinned = theme.tokens['accent-ink']
  const ink = isUsableTokenValue(pinned) ? pinned : (readableInk(theme.tokens.primary ?? BASE_PRIMARY) ?? '#ffffff')
  root.style.setProperty('--nh-accent-ink', ink)
  root.style.setProperty('--nh-brand-ink', readableInk(theme.tokens.brand ?? BASE_BRAND) ?? '#ffffff')

  root.style.colorScheme = theme.scheme

  if (typeof theme.css === 'string' || !theme.cssModule) {
    injectCss(theme.css)
    return
  }
  injectCss(undefined)
  void themeCss(theme)
    .then((css) => {
      if (gen === applyGeneration) injectCss(css)
    })
    .catch(() => {
      // the chunk is gone: after an upgrade this tab holds the old index
    })
}

export async function cacheTheme(theme: Theme): Promise<void> {
  try {
    const css = await themeCss(theme)
    const resolved: Theme = { ...theme, css, cssModule: undefined }
    localStorage.setItem(CACHE_KEY, JSON.stringify(resolved))
  } catch {
    // storage full/blocked, or the chunk did not load - purely cosmetic
  }
}

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
    // fall back to stylesheet defaults
  }
}

export function urlThemeOverride(): Theme | null {
  if (urlThemeId === null) return null
  return BUILTIN_THEMES.find((t) => t.id === urlThemeId) ?? BUILTIN_THEMES[0]
}

export function resolveTheme(id: string | undefined, customThemes: Theme[]): Theme {
  return BUILTIN_THEMES.find((t) => t.id === id) ?? customThemes.find((t) => t.id === id) ?? BUILTIN_THEMES[0]
}

export function listThemes(customThemes: Theme[]): Theme[] {
  return [...BUILTIN_THEMES, ...customThemes.filter((t) => !BUILTIN_THEME_IDS.has(t.id))]
}
