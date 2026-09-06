import type { SettingField } from '../types'

export interface StateIconRule {
  state: string
  icon?: string
  color?: string
}

export interface StateIconConfig {
  icon?: string
  iconActive?: string
  iconColor?: string
  iconColorActive?: string
  stateIcons?: StateIconRule[]
}

export interface ResolvedIcon {
  icon?: string
  color?: string
}

export function stateMatches(command: string | number | undefined, raw: string | undefined): boolean {
  if (command == null || raw == null) return false
  const cmd = String(command)
  if (raw === cmd) return true
  if (cmd.trim() === '' || raw.trim() === '') return false
  const a = Number(raw)
  const b = Number(cmd)
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b
}

const RANGE = /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/

function ruleMatches(rule: StateIconRule, raw: string | undefined): boolean {
  if (raw === undefined || typeof rule.state !== 'string' || rule.state === '') return false
  const m = RANGE.exec(rule.state.trim())
  if (m) {
    const v = Number(raw)
    if (!Number.isNaN(v)) {
      const lo = Number(m[1])
      const hi = Number(m[2])
      return v >= Math.min(lo, hi) && v <= Math.max(lo, hi)
    }
  }
  return stateMatches(rule.state, raw)
}

export function resolveStateIcon(c: StateIconConfig, active: boolean, state?: string): ResolvedIcon {
  if (Array.isArray(c.stateIcons)) {
    const rule = c.stateIcons.find((r) => r && ruleMatches(r, state))
    if (rule && (rule.icon || rule.color)) {
      return {
        icon: rule.icon || (active && c.iconActive) || c.icon || undefined,
        color: rule.color || (active && c.iconColorActive) || c.iconColor || undefined
      }
    }
  }
  return {
    icon: (active && c.iconActive) || c.icon || undefined,
    color: (active && c.iconColorActive) || c.iconColor || undefined
  }
}

export const STATE_ICON_SETTINGS: SettingField[] = [
  { key: 'icon', type: 'icon', label: 'Icon' },
  { key: 'iconActive', type: 'icon', label: 'Icon when active' },
  { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
  { key: 'iconColorActive', type: 'color', label: 'Icon color when active' },
  { key: 'stateIcons', type: 'stateicons', label: 'Per-state icons' }
]
