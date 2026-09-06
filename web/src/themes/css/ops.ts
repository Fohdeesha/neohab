import { fontFace } from './shared'

/**
 * Operations - a control-room board.
 *
 * A dark lit field of instrument panels, tiny wide-spaced uppercase captions, and very large
 * light geometric figures with their units raised beside them. Green reads as on target and red
 * as off it, on the values, the gauge rings, the trend arrows and the chart alike - all of which
 * come from the `good`, `bad` and chart-palette tokens rather than being written in here.
 *
 * Every widget is a panel: a translucent navy surface the page's light falls across, framed by a
 * bezel that is brightest at its top edge - a border gradient, not a flat hairline. `border-image`
 * is what carries that, which is why this theme's radius token is 0: a border gradient squares off
 * rounded corners, so the two cannot be combined.
 *
 * The instrument lighting (`rim-hi`/`rim-lo`, `face-hi`/`face-lo`) is likewise set as tokens; the
 * gauge defaults them to flat, so only a theme that lights them up gets a lit face.
 */
export const OPS_CSS = `${fontFace('Montserrat', 'montserrat.woff2', '100 900', 'woff2-variations')}/* The board is lit, not painted flat: a cold blue wash falls from above and deepens to black
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
  color: var(--nh-accent-ink, #fff);
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
/* A widget asking for no card keeps none, exactly as in every other theme - an accent still
   panels it, because those rules sit two classes deep. */
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
/* no stroke rule on the rim on purpose: it takes the shading gradient from its attribute, and
   any stylesheet stroke would beat it (the rim-hi/rim-lo tokens are what colour it) */
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
.nh-player__btn,
.nh-step--plain .nh-step__box,
.nh-step--plain .nh-step__ctl,
.nh-step--plain .nh-step__split {
  background: transparent;
  border-color: color-mix(in srgb, var(--nh-primary) 40%, transparent);
}
.nh-selection__btn--active {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
  color: var(--nh-accent-ink, #fff);
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
/* The log console is a readout: the level tag in the board's blue, the time and the logger as
   dim captions, and the pill a lit chip like the rest. */
.nh-log__level {
  color: var(--nh-primary);
}
.nh-log__time,
.nh-log__logger {
  color: color-mix(in srgb, var(--nh-primary) 40%, var(--nh-text-dim));
}
.nh-log__jump {
  background-image: linear-gradient(170deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0) 55%);
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
