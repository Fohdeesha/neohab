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

export function nextFreeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

export function slugify(name: string, fallback: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || fallback
  return nextFreeId(base, taken)
}
