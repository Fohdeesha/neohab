import { bareAndNewTile, squareControls, tightCellInsets } from './shared'

export const SWISS_CSS = `:root {
  --sw-line: color-mix(in srgb, var(--nh-text) 45%, transparent);
}
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-variant-numeric: tabular-nums;
  background-image: none;
}
::selection {
  background: var(--nh-brand);
  color: #fff;
}
/* A tile is nothing at all: the content sits directly on the page. */
.nh-widget,
.nh-tile {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
/* A Home tile is a section under a rule. Hover is a wash only: the base stylesheet turns the
   border red on hover, and here the rule stays the rule. The two exceptions come after this,
   because the new-tile rule has to win over the section rule at equal specificity. */
.nh-tile {
  border-top: 2px solid var(--nh-text);
  padding: 8px 6px 10px;
}
.nh-tile:hover {
  background: color-mix(in srgb, var(--nh-text) 7%, transparent);
  border-color: var(--nh-text);
}
${bareAndNewTile({
  reset: '  background: transparent;\n  border: none;',
  newTileBorder: '1px dashed var(--sw-line)'
})}.nh-tile--new {
  padding: 18px;
}
.nh-tile__name {
  font-weight: 700;
  letter-spacing: -0.01em;
}
/* The name row carries the rule. It is inset by a margin rather than a padding so the rule and
   the caption move together and the caption stays flush with the rule's left end, the way the
   board's captions do. A name at the bottom gets a hairline instead: there it is a footnote. */
.nh-widget__label {
  border-top: 2px solid var(--nh-text);
  margin: 0 8px;
  text-transform: lowercase;
  letter-spacing: 0;
  font-weight: 400;
  font-size: 0.78em;
  color: var(--nh-text-dim);
}
.nh-labelbottom .nh-widget__label {
  border-top-width: 1px;
  border-top-color: var(--nh-border);
}
${tightCellInsets({ label: '5px 0 0', labelBottom: '4px 0 6px', body: '6px 8px 8px' })}/* The short-cell shed keeps a horizontal padding for a caption that is not inset by a margin;
   this one is, so the shed's own inset would double it. */
@container (max-height: 104px) {
  .nh-widget__label {
    padding: 3px 0 0;
  }
  .nh-labelbottom .nh-widget__label {
    padding: 2px 0 3px;
  }
}
@container (max-width: 120px) {
  .nh-widget__label {
    margin: 0 4px;
  }
}
/* Readings are the bold figures of the board; captions and keys are the dim ones. */
.nh-value__text,
.nh-stat__value,
.nh-clock__time,
.nh-dial__value,
.nh-gauge__value,
.nh-slider__value,
.nh-fader__read,
.nh-roller__pos,
.nh-weather__detvalue {
  font-weight: 700;
  letter-spacing: -0.02em;
}
/* A reading sits top-left under its caption, like a status tile, not in the middle of a card. */
.nh-widget__body--center:has(> .nh-value, > .nh-clock) {
  align-items: flex-start;
  justify-content: flex-start;
}
.nh-clock {
  text-align: left;
}
/* The weather readings are the board's key/value rows: a hairline under each pair. */
.nh-weather__detail {
  border-bottom: 1px solid var(--nh-border);
  padding-bottom: 2px;
}
.nh-label {
  font-weight: 700;
  letter-spacing: -0.01em;
}
.nh-label--pill,
.nh-stat__badge {
  border-radius: 0;
}
/* A label on a filled tile is the board's status plate: wide-tracked capitals. */
.nh-acc-filled .nh-label {
  text-transform: uppercase;
  letter-spacing: 0.32em;
}
/* A panel group is a section: one rule across its top, no box. */
.nh-group {
  border: none;
  border-top: 2px solid var(--nh-text);
}
/* Controls are outlined, and the one in force is a plate in the text colour. Base and active
   are both declared here because the modifier shares the base class's specificity. */
.nh-button--plain,
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn,
.nh-step--plain .nh-step__box,
.nh-step--plain .nh-step__ctl,
.nh-step--plain .nh-step__split,
.nh-chip,
.nh-chart__chip,
.nh-chart__expand,
.nh-iconbtn,
.nh-selection__select {
  background: transparent;
  border: 1px solid var(--sw-line);
  border-radius: 0;
  box-shadow: none;
  color: var(--nh-text);
}
.nh-button--plain {
  font-weight: 500;
}
.nh-button--plain:active,
.nh-selection__btn:active,
.nh-roller__btn:active,
.nh-player__btn:active,
.nh-step--plain .nh-step__box:active,
.nh-chip:active {
  background: color-mix(in srgb, var(--nh-text) 14%, transparent);
}
.nh-button--plain.nh-button--active,
.nh-selection__btn--active,
.nh-chip--on,
.nh-chart__chip--on {
  background: var(--nh-text);
  border-color: var(--nh-text);
  color: var(--nh-bg);
}
.nh-button--plain.nh-button--active .nh-icon--mdi {
  background-color: var(--nh-bg);
}
.nh-chip--action {
  border-style: dashed;
}
.nh-iconbtn--live {
  color: var(--nh-primary);
}
.nh-button--plain.nh-button--active .nh-button__caption {
  color: var(--nh-bg);
  opacity: 0.7;
}
.nh-player__btn--main {
  border-color: var(--nh-text);
}
.nh-chart__chip--reset {
  color: var(--nh-text-dim);
}
.nh-chart__expand:hover {
  border-color: var(--nh-text);
}
.nh-chart .u-over,
.nh-chart .u-under {
  border-radius: 0;
}
.nh-btn {
  border-radius: 0;
}
.nh-field input[type='text'],
.nh-field input[type='number'],
.nh-field input[type='password'],
.nh-field select,
.nh-field textarea {
  border-radius: 0;
}
/* The switch is a square block that fills when on. */
.nh-switch__track,
.nh-switch__thumb {
  border-radius: 0;
}
.nh-switch__track {
  background: transparent;
  border-color: var(--sw-line);
}
.nh-switch--on .nh-switch__track {
  background: var(--nh-text);
  border-color: var(--nh-text);
}
.nh-switch--on .nh-switch__thumb {
  background: var(--nh-bg);
}
.nh-switch--on .nh-icon--mdi {
  background-color: var(--nh-text);
}
/* The dial is one of the board's bars bent round: a thin flat grey track, a fill in the text
   colour (the accent token is the text colour in this theme) and square ends. */
.nh-dial__track {
  stroke: var(--nh-surface-2);
  stroke-width: 4.5;
  stroke-linecap: butt;
}
.nh-dial__fill {
  stroke-width: 4.5;
  stroke-linecap: butt;
}
.nh-dial__knob {
  fill: var(--nh-text);
}
/* The slider is a flat track with an index mark. The two engines' pseudo-elements stay in
   separate rules: grouped, the whole rule is invalid in whichever engine does not know the
   other's prefix. */
.nh-slider__input {
  appearance: none;
  -webkit-appearance: none;
  height: 24px;
  background: transparent;
}
.nh-slider__input::-webkit-slider-runnable-track {
  height: 6px;
  background: var(--nh-surface-2);
  border-radius: 0;
}
.nh-slider__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 6px;
  height: 20px;
  margin-top: -7px;
  background: var(--nh-text);
  border-radius: 0;
  border: none;
}
.nh-slider__input::-moz-range-track {
  height: 6px;
  background: var(--nh-surface-2);
  border-radius: 0;
}
.nh-slider__input::-moz-range-thumb {
  width: 6px;
  height: 20px;
  background: var(--nh-text);
  border-radius: 0;
  border: none;
}
.nh-slider__input::-moz-range-progress {
  height: 6px;
  background: var(--nh-text);
}
/* The colour picker's tracks keep their gradients; the caps become fader knobs. */
.nh-color__swatch {
  border-radius: 0;
  border: none;
}
.nh-color__track::-webkit-slider-runnable-track {
  border-radius: 0;
  border-color: transparent;
}
.nh-color__track::-webkit-slider-thumb {
  border-radius: 0;
  width: 8px;
  height: 22px;
  margin-top: -5px;
  border: 1px solid #000;
  box-shadow: none;
}
.nh-color__track::-moz-range-track {
  border-radius: 0;
}
.nh-color__track::-moz-range-thumb {
  border-radius: 0;
  width: 8px;
  height: 22px;
  border: 1px solid #000;
  box-shadow: none;
}
/* The log is one of the board's tables: a hairline under every row, the level set bold in the
   ink, and the pill a plate in the text colour like every other active control here. */
.nh-log__line {
  border-bottom: 1px solid var(--nh-border);
}
.nh-log__level {
  font-weight: 700;
  color: var(--nh-text);
}
.nh-log__jump {
  background: var(--nh-text);
  color: var(--nh-bg);
}
/* A picture sits on a flat grey panel, so a letterboxed camera reads as a mounted image. */
.nh-camera,
.nh-camera__media,
.nh-image {
  background: var(--nh-surface-2);
}
/* Page chrome: a rule under the masthead, a bold lowercase title with the brand's red mark. */
.nh-dash__bar {
  background: var(--nh-bg);
  border-bottom: 2px solid var(--nh-text);
}
.nh-dash__title {
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
  text-transform: lowercase;
}
.nh-dash__title::before {
  content: '';
  display: inline-block;
  width: 9px;
  height: 9px;
  margin: 0 9px 3px 0;
  background: var(--nh-brand);
  vertical-align: middle;
}
/* The sidebar is a list of rows under hairlines; the current one is bold with a red glyph. */
.nh-side {
  background: var(--nh-bg);
  border-right: 1px solid var(--nh-border);
}
.nh-side__item {
  border-radius: 0;
  border-bottom: 1px solid var(--nh-border);
}
.nh-side__item:hover {
  background: color-mix(in srgb, var(--nh-text) 7%, transparent);
}
.nh-side__item--active {
  background: transparent;
  color: var(--nh-text);
  font-weight: 700;
}
.nh-side__item--active .nh-side__glyph {
  color: var(--nh-brand);
}
${squareControls()}`
