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
  /**
   * Optional stylesheet applied with the theme, for looks that tokens cannot express
   * (fonts, widget-frame structure). Admin-authored, like the rest of the config.
   */
  css?: string
}

/**
 * Shared by both Swiss Sheet themes - Swiss International Typographic Style. Everything is
 * flat; structure comes from rules and typography rather than boxes: widgets are unboxed
 * sections under a two-tone rule (red index segment running into ink), resting controls are
 * outlined blocks, the active state is a lighter red plate, and a faint drafting grid fills
 * the empty space between sections. Type is Instrument Sans (bundled, declared here so it
 * only downloads when one of these themes is active). Every color derives from the tokens
 * via color-mix, so this one stylesheet serves the dark and light variants.
 */
const SWISS_CSS = `@font-face {
  font-family: 'Instrument Sans';
  src: url('fonts/instrument-sans.woff2') format('woff2-variations');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
/* The page is a drafting sheet: red baseline ruling + grey column lines fill every empty
   area (the raster from the reference), so voids between panels read as designed space. */
body {
  font-family: 'Instrument Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.006em;
  background-image:
    repeating-linear-gradient(
      to bottom,
      color-mix(in srgb, var(--nh-primary) 9%, transparent) 0 1px,
      transparent 1px 24px
    ),
    repeating-linear-gradient(
      to right,
      color-mix(in srgb, var(--nh-text) 5%, transparent) 0 1px,
      transparent 1px 24px
    );
}
::selection {
  background: var(--nh-primary);
  color: #fff;
}
:root {
  --nh-shadow: none;
}
/* Widgets are UNBOXED sections of the sheet, exactly like the reference: no grey fill, no
   side borders - just a two-tone rule on top (red index segment running into ink) and the
   content directly on clean page black. The solid bg-color masks the drafting grid inside
   content regions, so the grid reads only in the empty space around them. A dim circle
   construction motif sits behind the content. */
.nh-widget,
.nh-tile {
  position: relative;
  background-color: var(--nh-bg);
  background-image:
    linear-gradient(to right, var(--nh-primary) 0 28px, var(--nh-text) 28px),
    radial-gradient(
      circle at 100% 100%,
      color-mix(in srgb, var(--nh-text) 5%, transparent) 0 30%,
      transparent 30.5%
    ),
    radial-gradient(
      circle at 100% 100%,
      transparent 0 37%,
      color-mix(in srgb, var(--nh-text) 7%, transparent) 37% 38%,
      transparent 38.5%
    );
  background-size: 100% 2px, 100% 100%, 100% 100%;
  background-repeat: no-repeat;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
.nh-tile:hover {
  background-color: color-mix(in srgb, var(--nh-text) 6%, var(--nh-bg));
}
/* Registration bracket in the free corner - the catalogue's measuring marks. */
.nh-widget::after,
.nh-tile::after {
  content: '';
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 10px;
  height: 10px;
  border-right: 1px solid color-mix(in srgb, var(--nh-text) 28%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--nh-text) 28%, transparent);
  pointer-events: none;
}
.nh-widget--bare {
  background: none;
  border: none;
}
.nh-widget--bare::after {
  display: none;
}
.nh-tile--new {
  background: none;
  border: 1px dashed var(--nh-border);
}
.nh-tile--new::after {
  display: none;
}
.nh-widget__label {
  text-transform: lowercase;
  letter-spacing: 0.02em;
  font-weight: 600;
}
/* Tighter body insets where the cell has room - gated so app.css's tight-cell sheds
   (same specificity, earlier sheet) keep winning in the regimes they exist for. */
@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body {
    padding: 8px 10px 10px;
  }
}
/* Controls: flat outlined blocks. Active = a solid red plate with white content.
   The active variants are re-declared because BEM modifiers share specificity with the
   base class - this later sheet would otherwise flatten them. */
.nh-button,
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--nh-text) 32%, transparent);
  box-shadow: none;
  font-weight: 600;
}
/* Target rings behind the button content - the instrument reticle. */
.nh-button {
  background-image:
    radial-gradient(
      circle at 50% 40%,
      transparent 0 26%,
      color-mix(in srgb, var(--nh-text) 9%, transparent) 26% 27.5%,
      transparent 28% 38%,
      color-mix(in srgb, var(--nh-text) 6%, transparent) 38% 39.5%,
      transparent 40%
    );
}
/* Active plate: a step lighter than the accent red - towards pink, not fully there.
   The full-strength red stays on rules, chips and the masthead. */
.nh-button--active,
.nh-selection__btn--active {
  background: color-mix(in srgb, var(--nh-primary) 75%, #fff);
  border-color: var(--nh-primary);
  color: #fff;
}
.nh-button--active {
  background-image:
    radial-gradient(
      circle at 50% 40%,
      transparent 0 26%,
      rgba(255, 255, 255, 0.22) 26% 27.5%,
      transparent 28% 38%,
      rgba(255, 255, 255, 0.14) 38% 39.5%,
      transparent 40%
    );
}
.nh-button--active .nh-icon--mdi {
  background-color: #fff;
}
.nh-player__btn--main {
  border-color: var(--nh-primary);
}
.nh-chart__chip--on {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
  color: #fff;
}
/* Readouts set bold and tight, like the sheet's data */
.nh-value__text,
.nh-clock__time {
  font-weight: 700;
  letter-spacing: -0.02em;
}
/* Page chrome: two-tone masthead rule (wider red segment than the widgets'), bold
   lowercase title */
.nh-dash__bar {
  border-bottom: none;
  background-image: linear-gradient(to right, var(--nh-primary) 0 64px, var(--nh-text) 64px);
  background-size: 100% 3px;
  background-position: left bottom;
  background-repeat: no-repeat;
}
.nh-dash__title {
  font-weight: 700;
  text-transform: lowercase;
  letter-spacing: -0.02em;
}
.nh-button,
.nh-iconbtn,
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn,
.nh-chart__chip,
.nh-color__swatch,
.nh-switch__track,
.nh-switch__thumb {
  border-radius: 0;
}
.nh-color__track::-webkit-slider-runnable-track {
  border-radius: 0;
}
.nh-color__track::-moz-range-track {
  border-radius: 0;
}
`

/**
 * Ember - a weather-station instrument panel: flat stat tiles on deep slate-navy with one
 * vivid ember-orange accent. The tile IS the unit: hairline edges, tight insets, small
 * mixed-case labels, and a huge bold value with its unit as a raised suffix. Buttons render
 * as flat tile content (no inner card), and an active toggle turns its WHOLE tile into the
 * solid accent plate. The accent is pinned into the first chart slot so single-series charts
 * render as orange traces with gradient fills out of the box, and the compass/gauge faces
 * pick it up too. Built for the "Tile accent" setting: filled tiles are solid orange
 * callouts, tinted ones the muted clay wash of the reference's garden rows.
 */
const EMBER_CSS = `/* the accent leads the chart palette; slots 2+ keep the validated built-ins */
:root {
  --nh-chart-1: #f2681f;
}
/* Stat-tile typography: labels center by DEFAULT via the cell var - a per-widget Name
   alignment choice still wins, because the cell's inline style overrides this sheet. */
.nh-gcell,
.nh-cell {
  --nh-labelalign: center;
}
/* Tiles are flat panels with a hairline edge; the chrome recedes so the values lead. */
.nh-widget {
  border-color: color-mix(in srgb, var(--nh-text) 8%, transparent);
  box-shadow: none;
}
/* Labels keep the case they were typed in, small and quiet - the reference writes
   "Temp" and "Rain: Month", not "TEMP". */
.nh-widget__label {
  text-transform: none;
  font-size: 0.72em;
  font-weight: 500;
  letter-spacing: 0.01em;
}
/* Tighter insets so a small tile is mostly content. Gated on cell size the same way the
   app's own tight-cell sheds are: this sheet is injected AFTER app.css, so an ungated
   rule here would override the sheds that exist for short/narrow cells. */
@container (min-height: 105px) {
  .nh-widget__label {
    padding: 9px 10px 0;
  }
  .nh-labelbottom .nh-widget__label {
    padding: 0 10px 9px;
  }
}
@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body {
    padding: 8px 10px 10px;
  }
}
/* The value IS the widget: huge, bold, centered, with the unit as a small raised suffix. */
.nh-value {
  justify-content: center;
  gap: 3px;
}
.nh-value__text {
  font-size: 2.6em;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.nh-value__unit {
  font-size: 0.85em;
  font-weight: 600;
  align-self: flex-start;
  margin-top: 0.55em;
}
@container (max-height: 104px) {
  .nh-value__text {
    font-size: 2em;
  }
}
.nh-clock__time {
  font-weight: 700;
  letter-spacing: -0.02em;
}
.nh-slider__value {
  font-weight: 600;
}
.nh-dial__value {
  font-weight: 700;
}
.nh-label {
  font-weight: 600;
}
/* A button fills its tile as flat content - no inner card, so no double border. The plain
   --active rule keeps a visible on-state without :has(); where :has() exists the WHOLE
   tile becomes the solid accent plate, the reference's callout look. */
.nh-button {
  background: transparent;
  border: none;
  border-radius: 0;
  font-size: 0.85em;
  color: var(--nh-text);
}
.nh-button:active {
  background: color-mix(in srgb, var(--nh-primary) 16%, transparent);
}
.nh-button--active {
  background: var(--nh-primary);
  color: #fff;
}
.nh-button--active .nh-icon--mdi {
  background-color: #fff;
}
.nh-widget:has(.nh-button--active) {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
}
.nh-widget:has(.nh-button--active) .nh-button--active {
  background: transparent;
}
/* Controls light solid accent when on, white-hot thumb - no translucent tints. */
.nh-switch--on .nh-switch__track {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
}
.nh-switch--on .nh-switch__thumb {
  background: #fff;
}
.nh-selection__btn {
  background: transparent;
}
.nh-selection__btn--active {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
  color: #fff;
}
.nh-roller__btn,
.nh-player__btn {
  background: transparent;
}
/* Chart chrome recedes to ghost chips; the plot is the content. */
.nh-chart__chip {
  border-color: transparent;
  padding: 4px 7px;
}
.nh-chart__chip--on {
  background: color-mix(in srgb, var(--nh-primary) 20%, transparent);
  border-color: transparent;
  color: var(--nh-primary);
}
.nh-chart__expand {
  border-color: transparent;
  opacity: 0.45;
}
.nh-chart__expand:hover {
  opacity: 1;
}
/* instrument faces sit directly on the tile; the compass wears the full accent */
.nh-compass__ring {
  stroke: var(--nh-primary);
  stroke-width: 3.2;
}
.nh-gauge__btrack {
  stroke: color-mix(in srgb, var(--nh-primary) 18%, var(--nh-surface-2));
}
/* The header bar floats on the page rather than ruling it off. */
.nh-dash__bar {
  border-bottom-color: transparent;
}
.nh-dash__title {
  font-weight: 600;
}
/* filled accent tiles: deep-ink label over the plate, like the reference callouts */
.nh-acc-filled .nh-widget__label {
  color: color-mix(in srgb, #241004 62%, var(--nh-primary));
}
.nh-acc-filled .nh-value__unit {
  color: rgba(255, 255, 255, 0.78);
}
/* tinted tiles: the muted clay wash with warmed text, the reference's garden rows */
.nh-acc-tinted .nh-widget {
  background: color-mix(in srgb, var(--nh-primary) 21%, var(--nh-bg));
  border-color: color-mix(in srgb, var(--nh-primary) 12%, var(--nh-bg));
}
.nh-acc-tinted .nh-widget__label,
.nh-acc-tinted .nh-button {
  color: color-mix(in srgb, var(--nh-primary) 62%, var(--nh-text));
}
`

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
    },
    css: SWISS_CSS,
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
    },
    css: SWISS_CSS,
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
    },
    css: EMBER_CSS,
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
const CSS_STYLE_ID = 'nh-theme-css'

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  for (const key of THEME_TOKENS) {
    const value = theme.tokens[key]
    if (value) root.style.setProperty('--nh-' + key, value)
    else root.style.removeProperty('--nh-' + key)
  }
  root.style.colorScheme = theme.scheme

  // Per-theme stylesheet: appended to <head> so it cascades after the app stylesheet.
  let styleEl = document.getElementById(CSS_STYLE_ID)
  if (theme.css) {
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = CSS_STYLE_ID
      document.head.appendChild(styleEl)
    }
    if (styleEl.textContent !== theme.css) styleEl.textContent = theme.css
  } else if (styleEl) {
    styleEl.remove()
  }
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
