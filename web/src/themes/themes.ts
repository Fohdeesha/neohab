/**
 * Theming. A theme is a named set of design-token values applied as CSS custom properties on
 * the document root; widgets and chrome only ever read tokens, so themes restyle everything.
 * Custom themes are stored on the server (`theme:<id>` components) and edited in Settings.
 * The active theme is cached locally and applied before first paint to avoid a flash.
 */

export const COLOR_TOKENS = ['bg', 'surface', 'surface-2', 'border', 'text', 'text-dim', 'primary', 'brand'] as const

/** All themable tokens: colors plus the corner radius (px). */
export const THEME_TOKENS = [...COLOR_TOKENS, 'radius'] as const

export type ThemeTokens = Partial<Record<(typeof THEME_TOKENS)[number], string>>

export interface Theme {
  id: string
  name: string
  scheme: 'dark' | 'light'
  tokens: ThemeTokens
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
]

const CACHE_KEY = 'neohab:themeCache'

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const key of THEME_TOKENS) {
    const value = theme.tokens[key]
    if (value) root.style.setProperty('--nh-' + key, value)
    else root.style.removeProperty('--nh-' + key)
  }
  root.style.colorScheme = theme.scheme
}

export function cacheTheme(theme: Theme): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(theme))
  } catch {
    /* storage full/blocked - purely cosmetic */
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

export function resolveTheme(id: string | undefined, customThemes: Theme[]): Theme {
  return (
    customThemes.find((t) => t.id === id) ??
    BUILTIN_THEMES.find((t) => t.id === id) ??
    BUILTIN_THEMES[0]
  )
}
