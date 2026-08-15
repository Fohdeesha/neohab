/**
 * Per-state icons shared by stateful widgets: a base icon, an optional override shown while
 * the widget is "active" (switch ON, toggle button matching its command), and optional
 * per-state rules for anything beyond two states (a 3-state contact, per-level dimmer bulbs).
 * Matching optional tint colors apply to monochrome (mdi) icons; full-color icons ignore them.
 *
 * Resolution order: the first matching per-state rule wins, then the active slot, then the
 * base icon. Everything funnels through one resolver so every widget behaves identically.
 */
import type { SettingField } from '../types'

export interface StateIconRule {
  /** Exact state to match (numeric-tolerant), or an inclusive numeric range like "1-49". */
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

/**
 * HABPanel toggle semantics: a toggle button is "active" exactly when the raw item state
 * equals the command, and only then sends the alternate command. isOn()-style heuristics must
 * NOT be used there - for a Rollershutter at an intermediate position (e.g. a half-stopped
 * garage door at 50) they invert the imported button's behavior. Numeric-tolerant so a stored
 * '100' still matches a server '100.0'. Shared with per-state icon rules for the same reason.
 */
export function stateMatches(command: string | number | undefined, raw: string | undefined): boolean {
  if (command == null || raw == null) return false
  const cmd = String(command)
  if (raw === cmd) return true
  if (cmd.trim() === '' || raw.trim() === '') return false
  const a = Number(raw)
  const b = Number(cmd)
  return !Number.isNaN(a) && !Number.isNaN(b) && a === b
}

/** Inclusive numeric range "a-b" (either bound may be negative: "-10-10" reads as -10..10). */
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
    // a non-numeric state can still exactly equal a range-looking string (fall through)
  }
  return stateMatches(rule.state, raw)
}

export function resolveStateIcon(c: StateIconConfig, active: boolean, state?: string): ResolvedIcon {
  if (Array.isArray(c.stateIcons)) {
    const rule = c.stateIcons.find((r) => r && ruleMatches(r, state))
    if (rule && (rule.icon || rule.color)) {
      return {
        icon: rule.icon || (active && c.iconActive) || c.icon || undefined,
        color: rule.color || (active && c.iconColorActive) || c.iconColor || undefined,
      }
    }
  }
  return {
    icon: (active && c.iconActive) || c.icon || undefined,
    color: (active && c.iconColorActive) || c.iconColor || undefined,
  }
}

/** Settings rows for the state-icon config, spread into a widget's `settings[]`. */
export const STATE_ICON_SETTINGS: SettingField[] = [
  { key: 'icon', type: 'icon', label: 'Icon' },
  { key: 'iconActive', type: 'icon', label: 'Icon when active' },
  { key: 'iconColor', type: 'color', label: 'Icon color (mono icons)' },
  { key: 'iconColorActive', type: 'color', label: 'Icon color when active' },
  { key: 'stateIcons', type: 'stateicons', label: 'Per-state icons' },
]
