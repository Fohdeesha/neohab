/**
 * The theming contract: every design token a theme may set, described well enough that the theme
 * editor can build itself from this list and a person can understand what each one does.
 *
 * A token is a CSS custom property on the document root, named `--nh-<key>`. Widgets and chrome
 * only ever read tokens, so setting one restyles everything that uses it. A token a theme leaves
 * unset falls back to the base value in app.css, which is why the editor offers "Auto" on every
 * field rather than forcing a value.
 *
 * This file is the single source of truth. Adding a token here makes it appear in the theme
 * editor, in the exported/imported theme files and in the documentation table, with no other
 * change; see `docs/theming.md`.
 */

/** Editor sections, in the order they are shown. */
export const TOKEN_GROUPS = ['Core', 'Semantic', 'Chart palette', 'Instruments'] as const
export type TokenGroup = (typeof TOKEN_GROUPS)[number]

/** How the editor renders a token, and how its value is validated. */
export type TokenKind = 'color' | 'length' | 'shadow' | 'unit'

export interface TokenSpec {
  key: string
  group: TokenGroup
  label: string
  kind: TokenKind
  /** One line explaining what setting it changes. Shown under the field. */
  hint: string
  /** Value used when the theme leaves it unset, for the editor's placeholder and the docs. */
  fallback: string
}

/**
 * Every token, in editor order.
 *
 * The Core group is the original palette - the eight colours and the corner radius every theme
 * has always had. Everything below it existed as a working CSS variable long before it appeared
 * here; promoting them was the point, because a variable a person cannot discover is not a
 * feature they have.
 */
export const TOKEN_SPECS: TokenSpec[] = [
  /* ---------------------------------- Core ---------------------------------- */
  {
    key: 'bg',
    group: 'Core',
    kind: 'color',
    label: 'Page background',
    fallback: '#0f1317',
    hint: 'Behind everything: the page itself, and the top bar.'
  },
  {
    key: 'surface',
    group: 'Core',
    kind: 'color',
    label: 'Widget surface',
    fallback: '#1a212a',
    hint: 'The face of a widget tile, a sheet and a Home tile.'
  },
  {
    key: 'surface-2',
    group: 'Core',
    kind: 'color',
    label: 'Raised surface',
    fallback: '#222c37',
    hint: 'A step above the surface: buttons, dropdowns, slider tracks.'
  },
  {
    key: 'border',
    group: 'Core',
    kind: 'color',
    label: 'Border',
    fallback: '#2c3844',
    hint: 'Every hairline: tile edges, field outlines, separators.'
  },
  { key: 'text', group: 'Core', kind: 'color', label: 'Text', fallback: '#dde3ea', hint: 'Readings, labels and controls - the main ink.' },
  {
    key: 'text-dim',
    group: 'Core',
    kind: 'color',
    label: 'Secondary text',
    fallback: '#8a94a0',
    hint: 'Widget names, captions, hints and units.'
  },
  {
    key: 'primary',
    group: 'Core',
    kind: 'color',
    label: 'Accent',
    fallback: '#38b6ff',
    hint: 'The theme accent: active controls, gauges, the tile-accent setting.'
  },
  {
    key: 'brand',
    group: 'Core',
    kind: 'color',
    label: 'Brand',
    fallback: '#e35a2b',
    hint: 'neohab’s own colour: the wordmark, primary buttons, editor handles.'
  },
  {
    key: 'radius',
    group: 'Core',
    kind: 'length',
    label: 'Corner radius',
    fallback: '12px',
    hint: 'Rounding on tiles, buttons and sheets. 0px gives square corners.'
  },
  {
    key: 'shadow',
    group: 'Core',
    kind: 'shadow',
    label: 'Tile shadow',
    fallback: '0 1px 3px rgba(0, 0, 0, 0.3)',
    hint: 'The drop shadow under a widget tile. `none` makes the design flat.'
  },

  /* -------------------------------- Semantic -------------------------------- */
  {
    key: 'good',
    group: 'Semantic',
    kind: 'color',
    label: 'Good',
    fallback: '#3fb950',
    hint: 'A reading that moved the way you want - the stat tile’s trend arrow.'
  },
  { key: 'bad', group: 'Semantic', kind: 'color', label: 'Bad', fallback: '#e5484d', hint: 'A reading that moved the wrong way.' },
  {
    key: 'accent-ink',
    group: 'Semantic',
    kind: 'color',
    label: 'Ink on the accent',
    fallback: 'automatic',
    hint: 'Text drawn on top of the accent colour (filled tiles, chips, badges). Left unset it is chosen automatically for contrast, which is usually what you want.'
  },

  /* ------------------------------ Chart palette ------------------------------ */
  ...Array.from({ length: 8 }, (_, i) => ({
    key: `chart-${i + 1}`,
    group: 'Chart palette' as const,
    kind: 'color' as const,
    label: `Series ${i + 1}`,
    fallback: 'built-in',
    hint:
      i === 0
        ? 'Colour of the first chart series, and of a timeline’s first state. Unset uses the built-in palette, which is checked for colour-blind separation.'
        : `Colour of chart series ${i + 1}. Unset keeps the built-in palette’s own choice.`
  })),

  /* ------------------------------- Instruments ------------------------------- */
  {
    key: 'rim-hi',
    group: 'Instruments',
    kind: 'color',
    label: 'Gauge rim highlight',
    fallback: 'the border colour',
    hint: 'Lit edge of a gauge’s outer rim. Set this and the rim is shaded rather than flat.'
  },
  {
    key: 'rim-lo',
    group: 'Instruments',
    kind: 'color',
    label: 'Gauge rim shadow',
    fallback: 'the border colour',
    hint: 'The rim’s far edge, where the light falls away.'
  },
  {
    key: 'face-hi',
    group: 'Instruments',
    kind: 'color',
    label: 'Gauge face light',
    fallback: 'transparent',
    hint: 'Glow inside a gauge face. Transparent by default, so faces are flat unless a theme lights them.'
  },
  {
    key: 'face-lo',
    group: 'Instruments',
    kind: 'color',
    label: 'Gauge face shadow',
    fallback: 'transparent',
    hint: 'The dark end of that glow.'
  },
  {
    key: 'band-light',
    group: 'Instruments',
    kind: 'unit',
    label: 'Gauge band highlight',
    fallback: '0',
    hint: 'Strength (0-1) of the bright film at the tip of a solid-arc gauge’s band. 0 is off.'
  },
  {
    key: 'band-shade',
    group: 'Instruments',
    kind: 'unit',
    label: 'Gauge band shading',
    fallback: '0',
    hint: 'Strength (0-1) of the sunk film at the start of that band. 0 is off.'
  }
]

export type TokenKey = string

export const THEME_TOKENS: readonly string[] = TOKEN_SPECS.map((t) => t.key)

export type ThemeTokens = Partial<Record<string, string>>

export function tokensInGroup(group: TokenGroup): TokenSpec[] {
  return TOKEN_SPECS.filter((t) => t.group === group)
}

/**
 * Is this a value we can safely put in a CSS custom property?
 *
 * Stored configuration is untrusted input (a hand-edited backup, a shared theme file), and while
 * a custom property cannot break out of its own declaration, a value carrying a `;` or a comment
 * marker is a sign of something that was never meant to be a token. Length is capped for the same
 * reason. Rejected values are dropped, so the base stylesheet's own value applies.
 */
export function isUsableTokenValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.length <= 200 &&
    !value.includes(';') &&
    !value.includes('}') &&
    !value.includes('/*')
  )
}
