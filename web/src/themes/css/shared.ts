// the idioms every structural theme needs, written once - each was re-derived by hand and each was subtly
// wrong somewhere

// `--nh-radius: 0` is not enough: several controls carry a hardcoded radius of their own
export function squareControls(): string {
  return `.nh-button--plain,
.nh-iconbtn,
.nh-selection__btn,
.nh-roller__btn,
.nh-player__btn,
.nh-chart__chip,
.nh-color__swatch,
.nh-switch__track,
.nh-switch__thumb,
.nh-log__jump {
  border-radius: 0;
}
.nh-step {
  --st-radius: 0;
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
  label?: string
  labelBottom?: string
  body?: string
}

// gated so it only applies where there is room: app.css sheds this padding in short and narrow cells, and a
// later sheet would beat it
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
  plate: string
  plateProperty?: 'background' | 'background-color'
  border?: string
  labelInk?: string
  extra?: string
}

export function wholeTileActive({ plate, plateProperty = 'background', border, labelInk, extra }: WholeTileActive): string {
  return `.nh-widget:has(.nh-button--plain.nh-button--active) {
  ${plateProperty}: ${plate};${border ? `\n  border-color: ${border};` : ''}${extra ? `\n${extra}` : ''}
}
.nh-widget:has(.nh-button--plain.nh-button--active) .nh-button--plain.nh-button--active {
  background: transparent;
}${
    labelInk
      ? `
.nh-widget:has(.nh-button--plain.nh-button--active) .nh-widget__label {
  color: ${labelInk};
}`
      : ''
  }
`
}

export interface BareAndNewTile {
  reset: string
  newTileBorder?: string
  bareExtra?: string
}

// put back the two tiles a blanket `.nh-widget, .nh-tile` rule always breaks
export function bareAndNewTile({ reset, newTileBorder, bareExtra }: BareAndNewTile): string {
  return `.nh-widget--bare {
${reset}${bareExtra ? `\n${bareExtra}` : ''}
}
.nh-tile--new {
${reset}${newTileBorder ? `\n  border: ${newTileBorder};` : ''}
}
`
}

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
