import { bareAndNewTile, fontFace, squareControls, tightCellInsets } from './shared'

/**
 * Swiss Sheet — the International Typographic Style.
 *
 * Everything is flat; structure comes from rules and typography rather than boxes. Widgets are
 * unboxed sections under a two-tone rule (a red index segment running into ink), resting controls
 * are outlined blocks, the active state is a lighter red plate, and a faint drafting grid fills
 * the empty space between sections.
 *
 * Every colour derives from the tokens through `color-mix`, which is what lets this one
 * stylesheet serve both the dark and the light variant — and what makes it the right one to copy
 * when starting a theme of your own.
 */
export const SWISS_CSS = `${fontFace('Instrument Sans', 'instrument-sans.woff2', '400 700', 'woff2-variations')}/* The page is a drafting sheet: red baseline ruling + grey column lines fill every empty
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
  color: var(--nh-accent-ink, #fff);
}
/* Widgets are UNBOXED sections of the sheet: no grey fill, no side borders - just a two-tone
   rule on top (red index segment running into ink) and the content directly on clean page
   black. The solid bg-color masks the drafting grid inside content regions, so the grid reads
   only in the empty space around them. A dim circle construction motif sits behind the content. */
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
${bareAndNewTile({
  reset: '  background: none;',
  bareExtra: '  border: none;',
  newTileBorder: '1px dashed var(--nh-border)',
})}.nh-widget--bare::after {
  display: none;
}
.nh-tile--new::after {
  display: none;
}
.nh-widget__label {
  text-transform: lowercase;
  letter-spacing: 0.02em;
  font-weight: 600;
}
${tightCellInsets({ body: '8px 10px 10px' })}/* Controls: flat outlined blocks. Active = a solid red plate with white content.
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
  color: var(--nh-accent-ink, #fff);
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
${squareControls()}`
