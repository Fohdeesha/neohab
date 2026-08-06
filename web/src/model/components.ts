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

/**
 * A display name as an id that is safe in a URL and in a component uid, de-duped against what is
 * already there. One implementation: dashboards and icons had a copy each, identical but for the
 * word they fall back to when a name reduces to nothing at all.
 */
export function slugify(name: string, fallback: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  return nextFreeId(base, taken)
}
