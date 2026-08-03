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

/**
 * LCD Console - a segment-display weather-station console: panels of glowing seven-segment
 * digits on a pure black void, hairline colored panel borders, tiny uppercase corner labels,
 * and faint unlit "ghost" segments behind every reading. Values and the digital clock set in
 * DSEG (bundled, OFL-1.1; the slanted bold the real consoles use), with DSEG's 14-segment
 * face for alphanumerics - so "OFF" and the label widget read as segment text too. Built for
 * the per-widget "Accent color" setting: each panel takes its own neon (green outdoor,
 * magenta records, amber warnings) via --nh-cellaccent, azure when unset - the console's
 * color zones. The ghost underlay is the data-ghost metadata the value and clock widgets
 * always carry; only this stylesheet draws it, so no other theme is affected.
 */
const LCD_CSS = `@font-face {
  font-family: 'DSEG7';
  src: url('fonts/dseg7.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'DSEG14';
  src: url('fonts/dseg14.woff2') format('woff2');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
/* the console's four neons lead the chart palette */
:root {
  --nh-chart-1: #3fd2f6;
  --nh-chart-2: #3bf07a;
  --nh-chart-3: #ff45d8;
  --nh-chart-4: #ffd23c;
  --nh-shadow: none;
}
::selection {
  background: var(--nh-primary);
  color: #000;
}
/* Section names sit in the top-RIGHT corner of their panel on the reference console.
   A per-widget Name alignment choice still wins - the cell's inline var overrides this. */
.nh-gcell,
.nh-cell {
  --nh-labelalign: flex-end;
}
/* Panels: pure black behind a hairline border in the panel's own neon. This also re-panels
   "bare" widgets (clock, label) - on the console EVERYTHING lives in a bordered zone. */
.nh-widget,
.nh-tile {
  background: var(--nh-bg);
  border: 1px solid var(--nh-cellaccent, color-mix(in srgb, var(--nh-primary) 60%, transparent));
  border-radius: 0;
  box-shadow: none;
}
.nh-tile:hover {
  background: #081018;
}
.nh-tile--new {
  border-style: dashed;
  border-color: var(--nh-border);
}
/* Corner labels: tiny, spaced, uppercase - instrument lettering, not display text. */
.nh-widget__label {
  text-transform: uppercase;
  font-size: 0.58em;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--nh-text) 85%, transparent);
}
/* Tighter insets so the digits own the panel - gated like the app's tight-cell sheds. */
@container (min-height: 105px) {
  .nh-widget__label {
    padding: 8px 10px 0;
  }
  .nh-labelbottom .nh-widget__label {
    padding: 0 10px 8px;
  }
}
@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body {
    padding: 6px 10px 10px;
  }
}
/* Readings: big slanted seven-segment digits in the panel neon, glowing. Non-numeric
   states fall through to the 14-segment face glyph-by-glyph, so "OFF" is segment text.
   Digit-only readings (data-ghost present) size in container units - the digits scale to
   FILL their panel like the console's, whatever the cell size; text readings stay modest. */
.nh-value {
  justify-content: center;
  gap: 7px;
}
.nh-value__text,
.nh-stat__value {
  position: relative;
  font-family: 'DSEG7', 'DSEG14', monospace;
  text-transform: uppercase;
  font-size: 1.4em;
  line-height: 1;
  color: var(--nh-cellaccent, var(--nh-primary));
  text-shadow:
    0 0 0.05em currentColor,
    0 0 0.28em color-mix(in srgb, currentColor 45%, transparent);
}
.nh-value__text[data-ghost],
.nh-stat__value[data-ghost] {
  font-size: calc(min(38cqh, 24cqw) * var(--nh-widgetscale, 1));
}
/* The lone tenths digit rides high while its separator stays on the baseline - the
   console's "68.5" typesetting. The span exists in every theme; only this one shrinks it. */
.nh-value__frac,
.nh-stat__frac {
  position: relative;
  font-size: 0.55em;
  vertical-align: 0.68em;
}
.nh-value__unit,
.nh-stat__unit {
  font-size: min(13cqh, 6.5cqw);
  font-weight: 700;
  letter-spacing: 0.05em;
  color: color-mix(in srgb, var(--nh-text) 85%, transparent);
  align-self: flex-start;
  margin-top: 0.15em;
}
/* Ghost segments: every digit's unlit '8' drawn faintly behind the reading, from the
   data-ghost metadata the widgets carry. Absolute overlay in the same font, so each ghost
   glyph sits exactly under its lit one. */
.nh-value__text::before,
.nh-value__frac::before,
.nh-stat__value::before,
.nh-stat__frac::before,
.nh-clock__time::before {
  content: attr(data-ghost);
  position: absolute;
  left: 0;
  top: 0;
  opacity: 0.14;
  pointer-events: none;
}
.nh-clock__time {
  position: relative;
  font-family: 'DSEG7', 'DSEG14', monospace;
  font-size: calc(min(34cqh, 15cqw) * var(--nh-widgetscale, 1));
  line-height: 1;
  color: var(--nh-cellaccent, var(--nh-primary));
  text-shadow:
    0 0 0.05em currentColor,
    0 0 0.28em color-mix(in srgb, currentColor 45%, transparent);
}
.nh-clock__date {
  font-family: 'DSEG14', sans-serif;
  text-transform: uppercase;
  font-size: min(14cqh, 6cqw);
  margin-top: 10px;
  color: var(--nh-cellaccent, var(--nh-primary));
  opacity: 0.9;
}
/* The label widget is display text (FRIDAY on the console's date bar): 14-segment, glowing. */
.nh-label {
  font-family: 'DSEG14', sans-serif;
  text-transform: uppercase;
  color: var(--nh-cellaccent, var(--nh-primary));
  text-shadow:
    0 0 0.05em currentColor,
    0 0 0.26em color-mix(in srgb, currentColor 45%, transparent);
}
/* Controls are flat content of their bordered panel - NO inner card, or every control tile
   would draw double borders (panel + control). The panel is the control: neon uppercase
   glyphs at rest, and an active toggle turns its WHOLE panel into the neon plate with dark
   glyphs (the plain --active rule keeps a visible on-state without :has()). */
.nh-button,
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn {
  background: transparent;
  border: none;
  color: var(--nh-cellaccent, var(--nh-primary));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  box-shadow: none;
}
.nh-button:active {
  background: color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 18%, transparent);
}
.nh-button--active,
.nh-selection__btn--active {
  background: var(--nh-cellaccent, var(--nh-primary));
  color: #000;
}
.nh-button--active .nh-icon--mdi {
  background-color: #000;
}
.nh-widget:has(.nh-button--active) {
  background: var(--nh-cellaccent, var(--nh-primary));
  border-color: var(--nh-cellaccent, var(--nh-primary));
  box-shadow: 0 0 16px color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 55%, transparent);
}
.nh-widget:has(.nh-button--active) .nh-button--active {
  background: transparent;
}
.nh-widget:has(.nh-button--active) .nh-widget__label {
  color: rgba(0, 0, 0, 0.6);
}
.nh-switch--on .nh-switch__track {
  background: var(--nh-cellaccent, var(--nh-primary));
  border-color: var(--nh-cellaccent, var(--nh-primary));
}
.nh-switch--on .nh-switch__thumb {
  background: #000;
}
.nh-switch--on .nh-switch__state {
  color: var(--nh-cellaccent, var(--nh-primary));
}
/* Every numeric readout is a segment display, not just the value widget: dial and gauge
   centers, the slider's number, the shutter position. Fills/sizes that live as SVG
   attributes are left alone (the standing trap); only the face and the panel neon change. */
.nh-dial__value {
  font-family: 'DSEG7', 'DSEG14', monospace;
  fill: var(--nh-cellaccent, var(--nh-primary));
  font-weight: 400;
}
.nh-gauge__value {
  font-family: 'DSEG7', 'DSEG14', monospace;
}
.nh-slider__value {
  font-family: 'DSEG7', 'DSEG14', monospace;
  color: var(--nh-cellaccent, var(--nh-primary));
  text-shadow: 0 0 0.3em color-mix(in srgb, currentColor 45%, transparent);
}
.nh-roller__pos {
  font-family: 'DSEG7', 'DSEG14', monospace;
  color: var(--nh-cellaccent, var(--nh-primary));
}
.nh-switch__state {
  font-family: 'DSEG14', sans-serif;
}
/* Home tiles carry their names in the 14-segment face too */
.nh-tile__name {
  font-family: 'DSEG14', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.95rem;
}
.nh-chart__chip--on {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
  color: #000;
}
/* The wind ring: bezel, ticks and readings all in the panel neon. The value/cardinal
   fills stay attributes on the SVG (no fill rules here - the documented trap). */
.nh-compass__ring {
  stroke: color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 85%, transparent);
  stroke-width: 2.2;
}
.nh-compass__tick {
  stroke: color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 50%, transparent);
  stroke-width: 1.4;
}
.nh-compass__tick--major {
  stroke: var(--nh-cellaccent, var(--nh-primary));
  stroke-width: 2;
}
.nh-compass__rose {
  fill: color-mix(in srgb, var(--nh-text) 80%, transparent);
}
.nh-compass__value {
  font-family: 'DSEG7', 'DSEG14', monospace;
  font-size: 23px;
}
.nh-compass__valueunit {
  fill: color-mix(in srgb, var(--nh-text) 80%, transparent);
}
.nh-gauge__btrack {
  stroke: color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 22%, #000);
}
/* Page chrome: a black masthead ruled off in the console azure, segment-face title. */
.nh-dash__bar {
  background: var(--nh-bg);
  border-bottom: 1px solid color-mix(in srgb, var(--nh-primary) 45%, transparent);
}
.nh-dash__title {
  font-family: 'DSEG14', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
/* segment displays have no rounded corners */
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
 * Operations - a control-room board: a dark lit field of instrument panels, tiny wide-spaced
 * uppercase captions, and very large light geometric figures with their units raised beside
 * them. Green reads as on target and red as off it, on the values, the gauge rings, the trend
 * arrows and the chart alike. Type is Montserrat (bundled, declared here so it only downloads
 * when this theme is active).
 *
 * Every widget is a panel: a translucent navy surface the page's light falls across, framed
 * by a bezel that is brightest at its top edge - a border gradient, not a flat hairline.
 * The accents still read on top of that: `outlined` draws the crisp rule around the panel the
 * board is drilled into, `filled` is the solid plate of a selected column. Readings size in
 * container units so a figure fills its panel at any cell size; an em would leave the number
 * small in a big tile, which is the one thing this board never does.
 */
const OPS_CSS = `@font-face {
  font-family: 'Montserrat';
  src: url('fonts/montserrat.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
:root {
  --nh-shadow: none;
  /* the board's semantics: a reading that moved the good way, and one that moved the other */
  --nh-good: #a3ce4a;
  --nh-bad: #ef2b34;
  /* the chart palette leads with the board's own green, then its blue */
  --nh-chart-1: #a3ce4a;
  --nh-chart-2: #3f7fe0;
  --nh-chart-3: #ef2b34;
  --nh-chart-4: #d8c34a;
  /* the instrument's own light: rim shading and the glow inside a gauge face. Both default
     to flat in the widget, so only a theme that sets them lights the face up. */
  --nh-rim-hi: color-mix(in srgb, var(--nh-primary) 85%, #ffffff);
  --nh-rim-lo: color-mix(in srgb, var(--nh-primary) 42%, #000000);
  --nh-face-hi: color-mix(in srgb, var(--nh-primary) 13%, transparent);
  --nh-face-lo: color-mix(in srgb, var(--nh-primary) 3%, transparent);
}
/* The board is lit, not painted flat: a cold blue wash falls from above and deepens to black
   at the bottom, with the corners darkened so the middle reads as the working area. Every
   surface on top of it is translucent, so this one light source shows through all of them. */
body {
  font-family: 'Montserrat', 'Avenir Next', 'Segoe UI', system-ui, sans-serif;
  background-color: #04070d;
  background-image:
    radial-gradient(
      115% 48% at 50% -6%,
      color-mix(in srgb, var(--nh-primary) 10%, transparent) 0%,
      color-mix(in srgb, var(--nh-primary) 3%, transparent) 45%,
      transparent 78%
    ),
    radial-gradient(75% 55% at 50% 112%, rgba(0, 0, 0, 0.92) 0%, transparent 66%),
    linear-gradient(180deg, #060b15 0%, #03060c 58%, #010206 100%);
  background-attachment: fixed;
}
::selection {
  background: var(--nh-primary);
  color: #fff;
}
/* Every widget is a lit panel: a translucent navy surface with the page's light falling
   across it - lifted at the top, sinking to dark at the bottom - framed by a bezel that is
   brightest at the top edge and quietens toward the bottom corners. The bezel is a border
   gradient, not a flat hairline; radius is 0 in this theme, which is what lets border-image
   carry it (border-image squares off rounded corners). The surfaces stay translucent so the
   one page light still reads through the whole board, and the bezel follows the tile's own
   accent color when one is set. */
.nh-widget,
.nh-tile {
  background-color: rgba(16, 28, 51, 0.38);
  background-image:
    radial-gradient(
      130% 100% at 50% -20%,
      color-mix(in srgb, var(--nh-primary) 14%, transparent) 0%,
      transparent 58%
    ),
    linear-gradient(165deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 40%, rgba(0, 0, 0, 0.32) 100%);
  border-image: radial-gradient(
      140% 190% at 50% -35%,
      color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 80%, #e8f1ff) 0%,
      color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 52%, transparent) 46%,
      color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 24%, transparent) 100%
    )
    1;
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.07),
    0 14px 28px -20px rgba(0, 0, 0, 0.9);
}
/* Bare widgets (label, clock) stay bare, exactly as they are in every other theme - an
   accent still panels them, because those rules sit two classes deep. */
.nh-widget--bare {
  background-color: transparent;
  background-image: none;
  border-image: none;
  border-color: transparent;
  box-shadow: none;
}
.nh-tile:hover {
  background-color: rgba(22, 38, 68, 0.55);
}
/* the + tile keeps its dashed invitation, not a panel */
.nh-tile--new {
  background-color: transparent;
  background-image: none;
  border-image: none;
  box-shadow: none;
}
.nh-tile__name {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.85rem;
  font-weight: 600;
}
/* Captions on an instrument, not headings: tiny, wide-spaced, uppercase, in the board's blue.
   Centered by default - a per-widget Name alignment choice still wins, because the cell's
   inline var overrides this sheet. */
.nh-gcell,
.nh-cell {
  --nh-labelalign: center;
}
.nh-widget__label {
  text-transform: uppercase;
  font-size: 0.66em;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: color-mix(in srgb, var(--nh-primary) 60%, var(--nh-text));
}
/* The reading IS the widget: a big light figure, its unit raised beside it in the reading's
   own color. Sized in container units so it fills its panel whatever the cell size. */
.nh-value__text,
.nh-stat__value {
  font-weight: 200;
  line-height: 0.92;
  letter-spacing: -0.01em;
  font-size: calc(min(40cqh, 20cqw) * var(--nh-devicescale, 1) * var(--nh-widgetscale, 1));
}
.nh-value__unit,
.nh-stat__unit {
  align-self: flex-start;
  margin-top: 0.25em;
  font-weight: 400;
  color: inherit;
  font-size: calc(min(14cqh, 7cqw) * var(--nh-devicescale, 1) * var(--nh-widgetscale, 1));
}
.nh-stat__subvalue {
  font-size: 1.15em;
  font-weight: 400;
}
.nh-stat__caption,
.nh-stat__subcaption {
  font-size: 0.78em;
  color: color-mix(in srgb, var(--nh-text) 74%, transparent);
}
.nh-stat__badge {
  font-size: 0.58em;
  letter-spacing: 0.06em;
}
.nh-clock__time {
  font-weight: 200;
}
.nh-clock__date--only,
.nh-label {
  font-weight: 400;
}
/* The instrument ring: hairline rims and dim marks in the board blue. The trace under a
   reading is white whatever the reading's color is - the one place this sheet deliberately
   overrides a stroke the widget set, because on this board the sparkline is chrome. */
/* no stroke rule here on purpose: the rim takes the shading gradient from its attribute, and
   any stylesheet stroke would beat it (--nh-rim-hi/--nh-rim-lo above are what colour it) */
.nh-gauge__rim {
  stroke-width: 0.5;
}
.nh-gauge__tkmark {
  stroke: color-mix(in srgb, var(--nh-primary) 42%, #000000);
  opacity: 1;
}
.nh-gauge__spark {
  stroke: var(--nh-text);
  stroke-width: 0.9;
  opacity: 0.95;
}
.nh-gauge__name {
  text-transform: uppercase;
  letter-spacing: 0.15em;
  font-weight: 500;
}
.nh-gauge__btrack {
  stroke: color-mix(in srgb, var(--nh-primary) 30%, var(--nh-bg));
}
.nh-gauge__center {
  fill: var(--nh-bg);
  stroke: color-mix(in srgb, var(--nh-primary) 45%, transparent);
}
/* Buttons are the board's links: bare blue text, the current one underlined rather than
   plated - a filled button would read as a control on a surface that has none. */
.nh-button {
  background: transparent;
  border: none;
  color: var(--nh-primary);
  font-weight: 500;
}
.nh-button:active {
  background: color-mix(in srgb, var(--nh-primary) 14%, transparent);
}
.nh-button--active {
  background: transparent;
  color: var(--nh-text);
  text-decoration: underline;
  text-underline-offset: 5px;
}
.nh-button--active .nh-icon--mdi {
  background-color: var(--nh-text);
}
/* A dropdown is a filter field: a label over a blue rule, nothing else. */
.nh-selection__select {
  padding-left: 0;
  background: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--nh-primary) 60%, transparent);
  border-radius: 0;
}
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn {
  background: transparent;
  border-color: color-mix(in srgb, var(--nh-primary) 40%, transparent);
}
.nh-selection__btn--active {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
  color: #fff;
}
.nh-switch--on .nh-switch__track {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
}
/* Chart chrome recedes to ghost chips; the trace is the content. */
.nh-chart__chip {
  border-color: transparent;
  color: color-mix(in srgb, var(--nh-primary) 70%, var(--nh-text));
}
.nh-chart__chip--on {
  background: color-mix(in srgb, var(--nh-primary) 22%, transparent);
  border-color: transparent;
  color: var(--nh-text);
}
.nh-chart__expand {
  border-color: transparent;
  opacity: 0.5;
}
/* Panels and framed regions carry the light too: the rule stays a crisp hairline, and a soft
   wash of the accent falls inward from it so the enclosed area reads as a lit recess rather
   than a box drawn on black. Kept low and wide so it never dims the content it frames. */
.nh-group {
  background-image: linear-gradient(
    178deg,
    color-mix(in srgb, var(--nh-primary) 7%, transparent) 0%,
    color-mix(in srgb, var(--nh-primary) 2%, transparent) 38%,
    transparent 80%
  );
  box-shadow:
    inset 0 1px 0 0 color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 35%, transparent),
    inset 0 0 110px -40px color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 80%, transparent);
}
/* An outlined tile is the panel the board is drilled into: the same lit surface, framed by
   the crisp full-strength accent rule instead of the bezel (border-image would paint over
   the accent border-color the base stylesheet sets). */
.nh-acc-outlined .nh-widget {
  border-image: none;
}
/* Page chrome: an unruled masthead, lit from the same source as the page, with a wide-spaced
   uppercase title. */
.nh-dash__bar {
  /* matched to the page gradient's own top band, so the masthead leaves no seam across the
     board - it is part of the same lit surface, not a bar laid on top of it */
  background: linear-gradient(180deg, #060b15 0%, #060b14 100%);
  border-bottom-color: transparent;
}
.nh-dash__title {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 0.82rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--nh-primary) 45%, var(--nh-text));
}
.nh-iconbtn {
  border-color: transparent;
  color: color-mix(in srgb, var(--nh-primary) 45%, var(--nh-text));
}
/* The filled accent is the board's selected column: a lit plate rather than a flat fill -
   the same light falls across it, and its lower edge sinks. White content, so the dark-ink
   label the other themes use would disappear into it. */
.nh-acc-filled .nh-widget {
  background-image: linear-gradient(
    172deg,
    color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 82%, #ffffff) 0%,
    var(--nh-cellaccent, var(--nh-primary)) 46%,
    color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 78%, #000000) 100%
  );
  border-image: none;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.22);
}
/* Tinted keeps its wash and takes the same falling light as every panel; its bezel already
   follows the accent color through --nh-cellaccent. */
.nh-acc-tinted .nh-widget {
  background-image:
    radial-gradient(
      130% 100% at 50% -20%,
      color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 18%, transparent) 0%,
      transparent 58%
    ),
    linear-gradient(165deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.015) 40%, rgba(0, 0, 0, 0.32) 100%);
}
.nh-acc-filled .nh-widget__label {
  color: rgba(255, 255, 255, 0.75);
}
/* Chips are small lit surfaces of their own, not stickers. */
.nh-stat__badge,
.nh-label--chip {
  background-image: linear-gradient(170deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0) 55%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}
/* The trace under a reading picks up the same wash as the panel it sits on. */
.nh-chart__chip--on {
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, transparent 70%);
}
.nh-acc-filled .nh-stat__caption,
.nh-acc-filled .nh-stat__subcaption,
.nh-acc-filled .nh-value__unit,
.nh-acc-filled .nh-stat__unit {
  color: rgba(255, 255, 255, 0.82);
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
    },
    css: LCD_CSS,
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
    },
    css: OPS_CSS,
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
