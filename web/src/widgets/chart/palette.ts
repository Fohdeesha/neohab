const SERIES_DARK = ['#3987e5', '#008300', '#d55181', '#c98500', '#199e70', '#d95926', '#9085e9', '#e66767']
const SERIES_LIGHT = ['#2a78d6', '#008300', '#e87ba4', '#eda100', '#1baf7a', '#eb6834', '#4a3aa7', '#e34948']

export type ChartScheme = 'dark' | 'light'

export function chartScheme(): ChartScheme {
  try {
    return getComputedStyle(document.documentElement).colorScheme.includes('light') ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function seriesColor(index: number, scheme: ChartScheme): string {
  const p = scheme === 'light' ? SERIES_LIGHT : SERIES_DARK
  const slot = Math.max(0, Math.min(index, p.length - 1))
  try {
    const themed = getComputedStyle(document.documentElement)
      .getPropertyValue('--nh-chart-' + (slot + 1))
      .trim()
    if (themed) return themed
  } catch {
    // non-browser (unit checks)
  }
  return p[slot]
}
