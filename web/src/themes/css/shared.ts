/**
 * The idioms every structural theme needs, written once.
 *
 * Five patterns kept recurring as themes were added, each re-derived by hand and each subtly
 * easy to get wrong - the project's own history is largely a record of catching them by
 * screenshot. They are functions rather than prose so a new theme composes them instead of
 * rediscovering them, and so the reasoning lives next to the CSS it explains.
 *
 * The rules these encode, and why they exist, are documented for theme authors in
 * `docs/theming.md`, and `themes/cssRules.ts` checks them mechanically - for the built-in themes
 * in the unit suite, and for a custom theme as it is typed in the editor.
 */

/**
 * Square off the controls that carry their own hardcoded radius.
 *
 * `--nh-radius: 0` is not enough on its own: several controls were built with a fixed radius of
 * their own before the token existed, and the two range-track pseudo-elements have to stay in
 * separate rules - grouping them makes the whole rule invalid in whichever engine does not know
 * the other's prefix.
 */
export function squareControls(): string {
  return `.nh-button,
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
}

export interface TightCellInsets {
  /** Padding for the widget's name row, when the cell is tall enough to have one. */
  label?: string
  /** Padding for that row when it has been moved to the bottom. Required alongside `label`. */
  labelBottom?: string
  /** Padding for the widget body, when the cell is both tall and wide enough. */
  body?: string
}

/**
 * Tighter insets, gated so they only apply where there is room for them.
 *
 * app.css sheds padding in short and narrow cells (`@container (max-height: 104px)` and
 * `(max-width: 120px)`) so text stays readable instead of drowning in nested padding. A theme
 * stylesheet is injected AFTER app.css, so an ungated padding rule silently wins over those
 * sheds and reintroduces the exact clipping they exist to prevent. Gating on the complementary
 * range is what keeps both behaviours.
 */
export function tightCellInsets({ label, labelBottom, body }: TightCellInsets): string {
  let out = ''
  if (label) {
    out += `@container (min-height: 105px) {
  .nh-widget__label {
    padding: ${label};
  }
  .nh-labelbottom .nh-widget__label {
    padding: ${labelBottom ?? label};
  }
}
`
  }
  if (body) {
    out += `@container (min-height: 105px) and (min-width: 121px) {
  .nh-widget__body {
    padding: ${body};
  }
}
`
  }
  return out
}

export interface WholeTileActive {
  /** Background for the tile of an active toggle button. */
  plate: string
  /**
   * Which property paints it. `background` is the shorthand and RESETS `background-image` with
   * it - right for a flat theme, wrong for one whose tiles carry a gradient, which would lose it
   * on exactly the tile it wants to emphasise. Themes with layered tiles want `background-color`.
   */
  plateProperty?: 'background' | 'background-color'
  /** Border colour for that tile; omitted leaves the theme's own. */
  border?: string
  /** Ink for the tile's name row while plated. */
  labelInk?: string
  /** Extra declarations inside the plated-tile rule (a glow, say). */
  extra?: string
}

/**
 * "The whole tile becomes the plate" - a button widget whose tile lights up as one block when
 * its toggle is on, rather than drawing a small button inside a tile.
 *
 * Two rules on purpose. `:has()` does the real work, and the theme is expected to have styled
 * `.nh-button--active` itself beforehand as the fallback: where `:has()` is unavailable the
 * button still shows an on-state instead of nothing at all. The inner button is then cleared,
 * or the plate would be drawn twice.
 */
export function wholeTileActive({ plate, plateProperty = 'background', border, labelInk, extra }: WholeTileActive): string {
  return `.nh-widget:has(.nh-button--active) {
  ${plateProperty}: ${plate};${border ? `\n  border-color: ${border};` : ''}${extra ? `\n${extra}` : ''}
}
.nh-widget:has(.nh-button--active) .nh-button--active {
  background: transparent;
}${
    labelInk
      ? `
.nh-widget:has(.nh-button--active) .nh-widget__label {
  color: ${labelInk};
}`
      : ''
  }
`
}

export interface BareAndNewTile {
  /** Declarations that undo the theme's blanket tile treatment. */
  reset: string
  /** Border for the "+ New dashboard" tile; it must stay a dashed invitation. */
  newTileBorder?: string
  /** Extra declarations for `.nh-widget--bare` only (hiding a decorative pseudo-element). */
  bareExtra?: string
}

/**
 * Put back the two tiles a blanket `.nh-widget, .nh-tile` rule always breaks.
 *
 * `.nh-widget--bare` is how the label and clock widgets ask for no card at all, and
 * `.nh-tile--new` is the dashed "+ New dashboard" invitation on the Home screen. A theme that
 * paints every tile silently overrides both - the bare widgets grow a card they never wanted,
 * and the new-dashboard tile stops looking like an invitation and starts looking like a
 * dashboard that exists.
 */
export function bareAndNewTile({ reset, newTileBorder, bareExtra }: BareAndNewTile): string {
  return `.nh-widget--bare {
${reset}${bareExtra ? `\n${bareExtra}` : ''}
}
.nh-tile--new {
${reset}${newTileBorder ? `\n  border: ${newTileBorder};` : ''}
}
`
}

/**
 * A bundled webfont, declared inside the theme that uses it so the browser only downloads it
 * when that theme is active. The path is relative on purpose: it has to resolve both under the
 * add-on's `/neohab/` and at the root in the dev server.
 *
 * `format` is explicit rather than inferred from the weight range: a variable font wants
 * `woff2-variations`, and a static font that declares a weight RANGE (as the DSEG faces do, to
 * say which weights the one file should answer for) is not variable and must not claim to be,
 * a browser may reject the file outright.
 */
export function fontFace(
  family: string,
  file: string,
  weight = '400',
  format: 'woff2' | 'woff2-variations' = 'woff2',
  style = 'normal'
): string {
  return `@font-face {
  font-family: '${family}';
  src: url('fonts/${file}') format('${format}');
  font-weight: ${weight};
  font-style: ${style};
  font-display: swap;
}
`
}
