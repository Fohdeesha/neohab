/**
 * The theme actually in effect on this device.
 *
 * Three things decide it, in order: a `?theme=` parameter forcing one for this page load (the
 * escape hatch - see `urlTheme.ts`), then this device's own override, then the shared
 * `settings.theme` every device follows by default. Resolving that in each place that needs it
 * went wrong the obvious way - several places read the shared setting alone, so a device with an
 * override showed one theme while the settings screen, the theme editor and the template widgets
 * all reasoned about another. This module is the one answer, so there is nothing to keep in sync.
 */
import { useConfigStore } from '../store/config'
import { useDeviceThemeStore } from '../store/deviceTheme'
import { resolveTheme, urlThemeOverride, type Theme } from './themes'

/** The theme in effect, re-rendering when either setting or the custom themes change. */
export function useActiveTheme(): Theme {
  const shared = useConfigStore((s) => s.settings.theme)
  const customThemes = useConfigStore((s) => s.customThemes)
  const override = useDeviceThemeStore((s) => s.themeId)
  return urlThemeOverride() ?? resolveTheme(override ?? shared, customThemes)
}

/** The same, read once, for code outside React's render (effects, message bridges). */
export function getActiveTheme(): Theme {
  const { settings, customThemes } = useConfigStore.getState()
  return urlThemeOverride() ?? resolveTheme(useDeviceThemeStore.getState().themeId ?? settings.theme, customThemes)
}
