/**
 * Two-slot per-state icons shared by stateful widgets: a base icon plus an optional override
 * shown while the widget is "active" (switch ON, toggle button matching its command), with
 * matching optional tint colors for monochrome (mdi) icons. Full-color icons ignore the tint.
 *
 * Everything funnels through one resolver so growing beyond two states later (e.g. tristate
 * contacts or per-level dimmer icons) stays a local change: add slots here, extend the
 * resolver's input, and every widget picks it up.
 */
import type { SettingField } from '../types'

export interface StateIconConfig {
  icon?: string
  iconActive?: string
  iconColor?: string
  iconColorActive?: string
}

export interface ResolvedIcon {
  icon?: string
  color?: string
}

export function resolveStateIcon(c: StateIconConfig, active: boolean): ResolvedIcon {
  return {
    icon: (active && c.iconActive) || c.icon || undefined,
    color: (active && c.iconColorActive) || c.iconColor || undefined,
  }
}

/** Settings rows for the two-slot icon config, spread into a widget's `settings[]`. */
export const STATE_ICON_SETTINGS: SettingField[] = [
  { key: 'icon', type: 'icon', label: 'Icon' },
  { key: 'iconActive', type: 'icon', label: 'Icon when active' },
  { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
  { key: 'iconColorActive', type: 'color', label: 'Icon color when active' },
]
