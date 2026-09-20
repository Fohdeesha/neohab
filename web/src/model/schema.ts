import { BACKGROUND_PREFIX, DASHBOARD_PREFIX, ICON_PREFIX, SETTINGS_UID, THEME_PREFIX, WIDGETDEF_PREFIX } from './components'

export type ComponentKind = 'dashboard' | 'theme' | 'widgetdef' | 'icon' | 'background' | 'settings'

export const SCHEMA_VERSIONS: Record<ComponentKind, number> = {
  dashboard: 3,
  theme: 1,
  widgetdef: 1,
  icon: 1,
  background: 1,
  settings: 1
}

export type Migration = (config: Record<string, unknown>) => Record<string, unknown>

const plainObject = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

const commandOrDefault = (v: unknown, fallback: string): string => (typeof v === 'string' && v !== '' ? v : fallback)

// 1 -> 2: the switch widget folded into the button. The style carries the look; the two behaviours it
// used to imply - always toggling, and reading any value above zero as on - are written out as the
// settings that now hold them, so the tile behaves exactly as it did.
//
// A button written before the merge is pinned too. Toggling is the default for a NEW widget now, and a
// stored button that never carried the key would otherwise start alternating with the default alternate
// command the day it was loaded.
const switchToButtonStyle: Migration = (config) => {
  const widgets = config.widgets
  if (!Array.isArray(widgets)) return config
  let changed = false
  const migrated = widgets.map((entry) => {
    const widget = plainObject(entry)

    if (widget.type === 'button') {
      const stored = plainObject(widget.config)
      if (typeof stored.toggle === 'boolean') return entry
      changed = true
      return { ...widget, config: { ...stored, toggle: false } }
    }

    if (widget.type !== 'switch') return entry
    changed = true
    const { onCommand, offCommand, ...rest } = plainObject(widget.config)
    return {
      ...widget,
      type: 'button',
      config: {
        ...rest,
        style: 'switch',
        toggle: true,
        nonZeroIsOn: true,
        // written out rather than left to fall through: a migration must not depend on what the
        // surviving widget happens to default to, which for the name has already changed once
        label: typeof rest.label === 'string' ? rest.label : '',
        command: commandOrDefault(onCommand, 'ON'),
        commandAlt: commandOrDefault(offCommand, 'OFF')
      }
    }
  })
  return changed ? { ...config, widgets: migrated } : config
}

// 2 -> 3: the stat widget folded into the value as its stat style. Both keys the merge could let a
// default decide are written out: style, because a stat carries none and the value's default is the
// plain look, and align, because a stat laid out its column from the left whatever it had stored.
const statToValueStyle: Migration = (config) => {
  const widgets = config.widgets
  if (!Array.isArray(widgets)) return config
  let changed = false
  const migrated = widgets.map((entry) => {
    const widget = plainObject(entry)
    if (widget.type !== 'stat') return entry
    changed = true
    const stored = plainObject(widget.config)
    return {
      ...widget,
      type: 'value',
      config: { ...stored, style: 'stat', align: typeof stored.align === 'string' ? stored.align : 'left' }
    }
  })
  return changed ? { ...config, widgets: migrated } : config
}

export const MIGRATIONS: Record<ComponentKind, Migration[]> = {
  dashboard: [switchToButtonStyle, statToValueStyle],
  theme: [],
  widgetdef: [],
  icon: [],
  background: [],
  settings: []
}

export function kindOf(uid: string): ComponentKind | null {
  if (uid === SETTINGS_UID) return 'settings'
  if (uid.startsWith(DASHBOARD_PREFIX)) return 'dashboard'
  if (uid.startsWith(THEME_PREFIX)) return 'theme'
  if (uid.startsWith(WIDGETDEF_PREFIX)) return 'widgetdef'
  if (uid.startsWith(ICON_PREFIX)) return 'icon'
  if (uid.startsWith(BACKGROUND_PREFIX)) return 'background'
  return null
}

// forgiving on purpose - Gson echoes 1 as 1.0, and anything malformed must not look like the future and lock
// someone out
export function versionOf(config: unknown): number {
  if (!config || typeof config !== 'object') return 1
  const raw = (config as Record<string, unknown>).version
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.floor(n))
}

export type MigrateResult =
  | { status: 'ok'; config: Record<string, unknown>; from: number; migrated: boolean }
  | { status: 'future'; from: number; expected: number }

export function migrateConfig(
  kind: ComponentKind,
  config: unknown,
  table: Record<ComponentKind, Migration[]> = MIGRATIONS,
  versions: Record<ComponentKind, number> = SCHEMA_VERSIONS
): MigrateResult {
  const expected = versions[kind]
  const from = versionOf(config)
  if (from > expected) return { status: 'future', from, expected }

  const base: Record<string, unknown> = config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {}
  if (from === expected) return { status: 'ok', config: base, from, migrated: false }

  let current = base
  const steps = table[kind] ?? []
  for (let v = from; v < expected; v++) {
    const step = steps[v - 1]
    current = step ? { ...step(current) } : current
    current.version = v + 1
  }
  return { status: 'ok', config: current, from, migrated: true }
}
