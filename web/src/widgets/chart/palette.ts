/**
 * Categorical series palette, one column per color scheme. Both columns are validated for
 * color-vision-deficiency separation (adjacent ΔE >= 8), normal-vision separation (>= 15) and
 * surface contrast against the built-in theme surfaces (dark widgets on #1a212a, light on
 * #ffffff). The ORDER is the CVD-safety mechanism - do not reorder casually.
 */

const SERIES_DARK = ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767']
const SERIES_LIGHT = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948']

export type ChartScheme = 'dark' | 'light'

/** Active color scheme, as applied by the theme engine (root colorScheme). */
export function chartScheme(): ChartScheme {
  try {
    return getComputedStyle(document.documentElement).colorScheme.includes('light') ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/**
 * Palette slot for a series position. Slots are assigned in fixed order and never cycled;
 * past the palette's end the last slot repeats - a visible signal to trim or recolor.
 *
 * A theme may recolor any slot by defining `--nh-chart-<n>` (1-based) in its stylesheet;
 * undefined slots keep the validated built-in column, so a theme that only pins its accent
 * into slot 1 leaves the rest of the palette's CVD-safe ordering intact. Use 6-digit hex
 * values - the gradient fill derives its alpha stops from them.
 */
export function seriesColor(index: number, scheme: ChartScheme): string {
  const p = scheme === 'light' ? SERIES_LIGHT : SERIES_DARK
  const slot = Math.max(0, Math.min(index, p.length - 1))
  try {
    const themed = getComputedStyle(document.documentElement)
      .getPropertyValue('--nh-chart-' + (slot + 1))
      .trim()
    if (themed) return themed
  } catch {
    /* non-browser (unit checks): built-ins only */
  }
  return p[slot]
}
