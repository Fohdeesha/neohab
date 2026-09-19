import { fontFace } from '../../themes/css/shared'

const ID = 'nh-segment-font'

/*
 * The seven-segment face ships in the jar but is only declared by the LCD theme's stylesheet, which
 * is injected while that theme is on. The segment look needs it in any theme, so it declares the
 * face itself: once, and only when a segment tile actually renders - a declared face nobody matches
 * is never fetched, so this costs nothing for everyone else. The url is relative to the document,
 * exactly as the theme's own injected copy is.
 */
export function ensureSegmentFont(): void {
  if (typeof document === 'undefined' || document.getElementById(ID)) return
  const el = document.createElement('style')
  el.id = ID
  el.textContent = fontFace('DSEG7', 'dseg7.woff2', '400 700')
  document.head.appendChild(el)
}
