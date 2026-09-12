import { fontFace, squareControls, tightCellInsets, wholeTileActive } from './shared'

export const LCD_CSS = `${fontFace('DSEG7', 'dseg7.woff2', '400 700')}${fontFace('DSEG14', 'dseg14.woff2', '400 700')}::selection {
  background: var(--nh-primary);
  color: var(--nh-accent-ink, #000);
}
/* Section names sit in the top-RIGHT corner of their panel on the reference console.
   A per-widget Name alignment choice still wins - the cell's inline var overrides this. */
.nh-gcell,
.nh-cell {
  --nh-labelalign: flex-end;
}
/* Panels: pure black behind a hairline border in the panel's own neon.
   nh-theme-allow: bare-panelled - this theme deliberately re-panels "bare" widgets (clock,
   label) rather than restoring them, because on the console EVERYTHING lives in a bordered
   zone. Declared here so the cross-theme check treats it as a decision, not an oversight. */
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
${tightCellInsets({ label: '8px 10px 0', labelBottom: '0 10px 8px', body: '6px 10px 10px' })}/* Readings: big slanted seven-segment digits in the panel neon, glowing. Non-numeric
   states fall through to the 14-segment face glyph-by-glyph, so "OFF" is segment text.
   Digit-only readings (data-ghost present) size in container units - the digits scale to
   FILL their panel like the console's, whatever the cell size; text readings stay modest. */
.nh-value {
  justify-content: center;
  gap: 7px;
}
.nh-value__text,
.nh-stat__value,
.nh-step__num,
.nh-weather__temp {
  position: relative;
  font-family: 'DSEG7', 'DSEG14', monospace;
  text-transform: uppercase;
  line-height: 1;
  color: var(--nh-cellaccent, var(--nh-primary));
  text-shadow:
    0 0 0.05em currentColor,
    0 0 0.28em color-mix(in srgb, currentColor 45%, transparent);
}
/* Sized apart from the weather temperature, which keeps its own layout-driven size in all
   three looks. Restating those three here would have meant restating their container-unit
   caps too, and a cap copied into a theme is a cap that drifts out of step with the widget. */
.nh-value__text,
.nh-stat__value {
  font-size: 1.4em;
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
.nh-step__num::before,
.nh-weather__temp::before,
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
/* The zone caption keeps a readable face on purpose - "Head office" in fourteen segments is not
   readable - but takes the instrument's colour, or it reads as grey text somebody forgot. */
.nh-clock__zone {
  color: var(--nh-cellaccent, var(--nh-primary));
  opacity: 0.85;
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
.nh-button--plain,
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn,
.nh-step--plain .nh-step__box,
.nh-step--plain .nh-step__ctl,
.nh-step--plain .nh-step__split {
  background: transparent;
  border: none;
  color: var(--nh-cellaccent, var(--nh-primary));
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
  box-shadow: none;
}
.nh-button--plain:active {
  background: color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 18%, transparent);
}
.nh-button--plain.nh-button--active,
.nh-selection__btn--active {
  background: var(--nh-cellaccent, var(--nh-primary));
  color: #000;
}
.nh-button--plain.nh-button--active .nh-icon--mdi {
  background-color: #000;
}
${wholeTileActive({
  plate: 'var(--nh-cellaccent, var(--nh-primary))',
  border: 'var(--nh-cellaccent, var(--nh-primary))',
  extra: '  box-shadow: 0 0 16px color-mix(in srgb, var(--nh-cellaccent, var(--nh-primary)) 55%, transparent);',
  labelInk: 'rgba(0, 0, 0, 0.6)'
})}.nh-switch--on .nh-switch__track {
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
   attributes are left alone (see ATTRIBUTE_PAINTED); only the face and the panel neon change. */
.nh-dial__value {
  font-family: 'DSEG7', 'DSEG14', monospace;
  fill: var(--nh-cellaccent, var(--nh-primary));
  font-weight: 400;
}
.nh-gauge__value {
  font-family: 'DSEG7', 'DSEG14', monospace;
}
.nh-slider__value,
.nh-fader__read,
.nh-fader__bound {
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
/* The log console: the level tag in the panel neon, warnings and errors in their own colours
   (those rules sit two classes deep in the base sheet and keep winning), the pill a neon plate. */
.nh-log__level {
  color: var(--nh-cellaccent, var(--nh-primary));
}
.nh-log__jump {
  background: var(--nh-cellaccent, var(--nh-primary));
  color: #000;
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
  color: var(--nh-accent-ink, #000);
}
/* The wind ring: bezel, ticks and readings all in the panel neon. The value/cardinal
   fills stay attributes on the SVG (no fill rules here - see ATTRIBUTE_PAINTED). */
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
${squareControls()}`
