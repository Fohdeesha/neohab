/**
 * Component uids and component names in the `neohab:config` namespace.
 *
 * Shared by the configuration store and the partial-export logic so there is exactly one
 * definition of what a dashboard, theme, widget definition, icon or background component is
 * called. Pure constants: anything may import this.
 */

export const DASHBOARD_PREFIX = 'dashboard:'
export const THEME_PREFIX = 'theme:'
export const WIDGETDEF_PREFIX = 'widgetdef:'
export const ICON_PREFIX = 'icon:'
export const BACKGROUND_PREFIX = 'background:'
export const SETTINGS_UID = 'settings'

export const DASHBOARD_COMPONENT = 'neohab:dashboard'
export const THEME_COMPONENT = 'neohab:theme'
export const WIDGETDEF_COMPONENT = 'neohab:widgetdef'
export const ICON_COMPONENT = 'neohab:icon'
export const BACKGROUND_COMPONENT = 'neohab:background'
export const SETTINGS_COMPONENT = 'neohab:settings'

/**
 * `<base>-2`, `-3`, ... until one is free. Shared by every "this id is taken" path so a copy
 * lands next to the original instead of overwriting it.
 */
export function nextFreeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
