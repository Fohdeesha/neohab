// one place resolves the theme in effect; three call sites used to get it wrong
import { useConfigStore } from '../store/config'
import { useDeviceThemeStore } from '../store/deviceTheme'
import { resolveTheme, urlThemeOverride, type Theme } from './themes'

export function useActiveTheme(): Theme {
  const shared = useConfigStore((s) => s.settings.theme)
  const customThemes = useConfigStore((s) => s.customThemes)
  const override = useDeviceThemeStore((s) => s.themeId)
  return urlThemeOverride() ?? resolveTheme(override ?? shared, customThemes)
}

export function getActiveTheme(): Theme {
  const { settings, customThemes } = useConfigStore.getState()
  return urlThemeOverride() ?? resolveTheme(useDeviceThemeStore.getState().themeId ?? settings.theme, customThemes)
}
