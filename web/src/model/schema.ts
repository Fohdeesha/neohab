import { BACKGROUND_PREFIX, DASHBOARD_PREFIX, ICON_PREFIX, SETTINGS_UID, THEME_PREFIX, WIDGETDEF_PREFIX } from './components'

export type ComponentKind = 'dashboard' | 'theme' | 'widgetdef' | 'icon' | 'background' | 'settings'

export const SCHEMA_VERSIONS: Record<ComponentKind, number> = {
  dashboard: 1,
  theme: 1,
  widgetdef: 1,
  icon: 1,
  background: 1,
  settings: 1
}

export type Migration = (config: Record<string, unknown>) => Record<string, unknown>

// empty, and correctly so: version 1 is the only shape neohab has ever written
export const MIGRATIONS: Record<ComponentKind, Migration[]> = {
  dashboard: [],
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
