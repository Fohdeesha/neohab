/**
 * The theme actually in effect on this device.
 *
 * Two settings decide it: the shared `settings.theme` every device follows by default, and a
 * per-device override that beats it. Resolving that in each place that needs it
 * went wrong the obvious way — several places read the shared setting alone, so a device with an
 * override showed one theme while the settings screen, the theme editor and the template widgets
 * all reasoned about another. This module is the one answer, so there is nothing to keep in sync.
 */
import { useConfigStore } from '../store/config'
import { useDeviceThemeStore } from '../store/deviceTheme'
import { resolveTheme, type Theme } from './themes'

/** The theme in effect, re-rendering when either setting or the custom themes change. */
export function useActiveTheme(): Theme {
  const shared = useConfigStore((s) => s.settings.theme)
  const customThemes = useConfigStore((s) => s.customThemes)
  const override = useDeviceThemeStore((s) => s.themeId)
  return resolveTheme(override ?? shared, customThemes)
}

/** The same, read once, for code outside React's render (effects, message bridges). */
export function getActiveTheme(): Theme {
  const { settings, customThemes } = useConfigStore.getState()
  return resolveTheme(useDeviceThemeStore.getState().themeId ?? settings.theme, customThemes)
}
