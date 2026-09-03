import { fontFace, wholeTileActive } from './shared'

/**
 * Assembly - a dark green glass production board.
 *
 * Translucent panels that blur what is behind them (the page's own soft-lit green, or a
 * background image when one is set), hairline mint borders with an inner top light, vivid green
 * instruments with brightened value tips, and the active control drawn as the board's selected
 * card - green outline, tinted fill, soft glow.
 *
 * The gauge band films are switched on through the `band-light` and `band-shade` tokens: the
 * widget draws them at zero strength everywhere, so they are invisible until a theme raises them.
 * The backdrop image ships with the add-on, because glass needs something to blur.
 */
export const ASSEMBLY_CSS = `${fontFace('Poppins', 'poppins-400.woff2', '400')}${fontFace('Poppins', 'poppins-500.woff2', '500')}${fontFace('Poppins', 'poppins-600.woff2', '600')}/* The room behind the glass: a defocused robot hall (bundled render - lit clerestory, rim-lit
   arms, floor sheen), under a light legibility scrim, over the gradient washes that stand in
   while it loads. This is what the panels blur, which is what makes them read as glass; an
   explicit background image from Settings paints over it on the dashboard surface as usual. */
body {
  font-family: 'Poppins', 'Segoe UI', system-ui, sans-serif;
  background-color: #0b110e;
  background-image:
    linear-gradient(180deg, rgba(7, 11, 9, 0.08) 0%, rgba(7, 11, 9, 0.16) 62%, rgba(5, 8, 6, 0.26) 100%),
    url('backgrounds/assembly-hall.jpg'),
    radial-gradient(
      120% 55% at 20% -10%,
      rgba(64, 211, 100, 0.1) 0%,
      rgba(64, 211, 100, 0.03) 45%,
      transparent 75%
    ),
    radial-gradient(80% 55% at 88% 112%, rgba(0, 0, 0, 0.85) 0%, transparent 62%),
    linear-gradient(172deg, #111b14 0%, #0b120e 55%, #070c09 100%);
  background-size: auto, cover, auto, auto, auto;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
}
::selection {
  background: var(--nh-primary);
  color: var(--nh-accent-ink, #06130a);
}
/* Every widget and home tile is a glass card: translucent green surface, hairline mint border,
   a faint light across the top, and a soft drop into the room. Matte - the reference's cards
   carry no gloss, only translucency and the hairline. */
.nh-widget,
.nh-tile {
  background-color: rgba(32, 48, 38, 0.48);
  background-image: linear-gradient(
    168deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.012) 42%,
    rgba(0, 0, 0, 0.2) 100%
  );
  border-color: rgba(190, 255, 210, 0.11);
  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.06),
    0 14px 30px -20px rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px) saturate(1.15);
  -webkit-backdrop-filter: blur(12px) saturate(1.15);
}
/* a widget asking for no card keeps none, and the + tile keeps its dashed invitation */
.nh-widget--bare {
  background-color: transparent;
  background-image: none;
  border-color: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.nh-tile--new {
  background-color: transparent;
  background-image: none;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.nh-tile:hover {
  background-color: rgba(44, 64, 50, 0.6);
  border-color: color-mix(in srgb, var(--nh-primary) 55%, transparent);
}
.nh-tile__name {
  font-weight: 500;
}
/* Card headers: white title, mixed case, with a vivid green chip behind a header icon -
   the reference's panel headers. The chip is drawn as a flex sibling and the icon pulled
   back over it, because a masked mono icon cannot carry a background of its own. */
.nh-widget__label {
  text-transform: none;
  font-size: 0.84em;
  font-weight: 600;
  letter-spacing: 0.005em;
  color: var(--nh-text);
}
.nh-widget__labelmain:has(> .nh-icon)::before {
  content: '';
  flex: 0 0 auto;
  width: 23px;
  height: 23px;
  border-radius: 7px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--nh-primary) 86%, #ffffff) 0%, var(--nh-primary) 100%);
  box-shadow: 0 0 10px -2px color-mix(in srgb, var(--nh-primary) 60%, transparent);
}
.nh-widget__labelmain:has(> .nh-icon) > .nh-icon {
  margin-left: -27px;
  position: relative;
}
.nh-widget__labelmain:has(> .nh-icon) > .nh-icon--mdi {
  background-color: #ffffff;
  -webkit-mask-size: 62%;
  mask-size: 62%;
}
/* Solid-arc gauges are the board's instruments: open glass face (no sector, no disc), a
   thick round-capped band with a soft green cast, over a thin dim track. */
.nh-dial--arc .nh-gauge__face {
  fill: transparent;
}
.nh-dial--arc .nh-gauge__center {
  fill: transparent;
  stroke: none;
}
.nh-dial--arc .nh-gauge__band,
.nh-dial--arc .nh-gauge__bandlight,
.nh-dial--arc .nh-gauge__bandshade {
  stroke-linecap: round;
}
.nh-dial--arc .nh-gauge__band {
  filter: drop-shadow(0 0 2.5px color-mix(in srgb, var(--nh-primary) 45%, transparent));
}
.nh-dial--arc .nh-gauge__btrack {
  stroke: rgba(190, 255, 210, 0.13);
  stroke-width: 2.4;
  stroke-linecap: round;
}
.nh-gauge__value {
  font-weight: 600;
}
/* the classic dial joins the instrument family: green arc, dim mint track, soft glow */
.nh-dial__track {
  stroke: rgba(190, 255, 210, 0.12);
}
.nh-dial__fill {
  filter: drop-shadow(0 0 2.5px color-mix(in srgb, var(--nh-primary) 45%, transparent));
}
.nh-dial__value {
  font-weight: 600;
}
/* A button IS its glass card - the zone-card pattern: flat content at rest, and the active
   one takes the selected treatment on the whole tile: green outline, tinted fill, soft glow. */
.nh-button {
  background: transparent;
  border: none;
}
.nh-button:active {
  background: color-mix(in srgb, var(--nh-primary) 10%, transparent);
}
.nh-button--active {
  background: color-mix(in srgb, var(--nh-primary) 12%, transparent);
  border: none;
}
/* resting mono icons take the board's green cast; the active rule below must stay AFTER this
   one (same specificity - source order is what keeps the active tint winning) */
.nh-button .nh-icon--mdi {
  background-color: color-mix(in srgb, var(--nh-primary) 55%, var(--nh-text));
}
.nh-button--active .nh-icon--mdi {
  background-color: var(--nh-primary);
}
${wholeTileActive({
  plate: 'color-mix(in srgb, var(--nh-primary) 10%, rgba(30, 44, 36, 0.5))',
  plateProperty: 'background-color',
  border: 'color-mix(in srgb, var(--nh-primary) 70%, transparent)',
  extra: `  box-shadow:
    inset 0 1px 0 0 rgba(255, 255, 255, 0.07),
    0 0 20px -6px color-mix(in srgb, var(--nh-primary) 50%, transparent),
    0 14px 30px -20px rgba(0, 0, 0, 0.85);`,
})}/* A button carrying an illustration is a zone card: media on top, title and dim caption
   bottom-left, the reference's left-column layout. */
.nh-button:has(.nh-button__media) {
  align-items: flex-start;
  text-align: left;
  gap: 8px;
}
.nh-button:has(.nh-button__media) .nh-button__label {
  font-weight: 600;
}
/* Small controls: outlined dark glass chips; the active one is a solid green plate with dark
   ink (the vivid green is light enough that white text would wash out on it). */
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn,
.nh-step--plain .nh-step__box,
.nh-step--plain .nh-step__ctl,
.nh-step--plain .nh-step__split {
  background: rgba(14, 22, 17, 0.5);
  border-color: rgba(190, 255, 210, 0.13);
}
.nh-selection__btn--active {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
  color: var(--nh-accent-ink, #06130a);
  font-weight: 600;
}
.nh-switch--on .nh-switch__track {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
}
.nh-chart__chip {
  background: rgba(14, 22, 17, 0.5);
  border-color: rgba(190, 255, 210, 0.13);
}
.nh-chart__chip--on {
  background: var(--nh-primary);
  border-color: var(--nh-primary);
  color: var(--nh-accent-ink, #06130a);
}
/* Stat tiles: a dim caption naming the figure, a semibold reading with its unit set small. */
.nh-stat__value {
  font-weight: 600;
  letter-spacing: -0.01em;
}
.nh-value__text {
  font-weight: 600;
}
/* Photo and video slots keep a soft dark vignette inside their rounded inset. */
.nh-camera__host {
  position: relative;
}
.nh-camera__host::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 34px rgba(0, 0, 0, 0.5);
}
/* Panel groups: a hairline framed recess, tinted by the group's own accent when one is set. */
.nh-group {
  border-color: color-mix(in srgb, var(--nh-cellaccent, #bfffd2) 32%, transparent);
  background-image: linear-gradient(178deg, rgba(255, 255, 255, 0.035) 0%, transparent 45%);
}
/* Page chrome: the top bar and sidebar are the same glass as the cards. */
.nh-dash__bar {
  background: rgba(11, 17, 14, 0.72);
  border-bottom-color: rgba(190, 255, 210, 0.09);
  backdrop-filter: blur(14px) saturate(1.15);
  -webkit-backdrop-filter: blur(14px) saturate(1.15);
}
.nh-dash__title {
  font-weight: 600;
}
.nh-side {
  background: rgba(11, 17, 14, 0.8);
  border-right-color: rgba(190, 255, 210, 0.09);
  backdrop-filter: blur(16px) saturate(1.15);
  -webkit-backdrop-filter: blur(16px) saturate(1.15);
}
.nh-side__item--active {
  background: rgba(190, 255, 210, 0.08);
}
`
