import { tightCellInsets, wholeTileActive } from './shared'

export const EMBER_CSS = `/* Stat-tile typography: labels center by DEFAULT via the cell var - a per-widget Name
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
.nh-widget--bare {
  border-color: transparent;
}
/* Labels keep the case they were typed in, small and quiet - the reference writes
   "Temp" and "Rain: Month", not "TEMP". */
.nh-widget__label {
  text-transform: none;
  font-size: 0.72em;
  font-weight: 500;
  letter-spacing: 0.01em;
}
${tightCellInsets({ label: '9px 10px 0', labelBottom: '0 10px 9px', body: '8px 10px 10px' })}/* The value IS the widget: huge, bold, centered, with the unit as a small raised suffix. */
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
.nh-button--plain {
  background: transparent;
  border: none;
  border-radius: 0;
  font-size: 0.85em;
  color: var(--nh-text);
}
.nh-button--plain:active {
  background: color-mix(in srgb, var(--nh-primary) 16%, transparent);
}
.nh-button--plain.nh-button--active {
  background: var(--nh-cellaccent, var(--nh-primary));
  color: var(--nh-accent-ink, #fff);
}
.nh-button--plain.nh-button--active .nh-icon--mdi {
  background-color: var(--nh-accent-ink, #fff);
}
${wholeTileActive({ plate: 'var(--nh-primary)', border: 'var(--nh-primary)' })}/* Controls light solid accent when on, white-hot thumb - no translucent tints. */
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
  background: var(--nh-cellaccent, var(--nh-primary));
  border-color: var(--nh-cellaccent, var(--nh-primary));
  color: var(--nh-accent-ink, #fff);
}
.nh-roller__btn,
.nh-player__btn,
.nh-step--plain .nh-step__box,
.nh-step--plain .nh-step__ctl,
.nh-step--plain .nh-step__split {
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
/* The log console's level tag takes the accent, like every other readout on this panel. */
.nh-log__level {
  color: var(--nh-primary);
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
.nh-acc-tinted .nh-button--plain {
  color: color-mix(in srgb, var(--nh-primary) 62%, var(--nh-text));
}
`
