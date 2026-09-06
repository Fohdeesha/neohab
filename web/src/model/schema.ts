/**
 * Reading the `version` back off a stored component.
 *
 * Every component neohab has ever written carries `version: 1`, and until 1.11 nothing ever read
 * it: there was no place to put a migration when a shape changes, and no answer at all for a
 * configuration written by a NEWER neohab than the one reading it. That second case is the
 * dangerous one - two people, or one person and a wall panel, can easily be on different
 * versions, and the old build would happily parse a shape it does not understand, render it
 * wrong, and then save its misreading back over the original.
 *
 * So there are two jobs here, and the second matters more than the first:
 *
 *  1. Bring an older component forward, one step at a time.
 *  2. REFUSE one from the future - and, having refused it, make sure nothing else in the app
 *     treats it as absent. A component that is merely "not loaded" is one the background
 *     collector calls unreferenced and the save path calls free, which is how a configuration
 *     gets destroyed by a version that was only trying to be careful.
 *
 * Pure and dependency-free, so the rules can be exercised without a browser or a server.
 */

import { BACKGROUND_PREFIX, DASHBOARD_PREFIX, ICON_PREFIX, SETTINGS_UID, THEME_PREFIX, WIDGETDEF_PREFIX } from './components'

export type ComponentKind = 'dashboard' | 'theme' | 'widgetdef' | 'icon' | 'background' | 'settings'

/**
 * The shape this build writes and understands, per kind.
 *
 * Per kind rather than one number for everything, because the kinds are independent: changing a
 * dashboard's shape should not declare every stored icon a version behind. Bump one of these ONLY
 * together with a migration below - `schema.test.ts` fails if they disagree.
 */
export const SCHEMA_VERSIONS: Record<ComponentKind, number> = {
  dashboard: 1,
  theme: 1,
  widgetdef: 1,
  icon: 1,
  background: 1,
  settings: 1
}

/** One step up. Takes a config at version N and returns it at N+1. Must not mutate its input. */
export type Migration = (config: Record<string, unknown>) => Record<string, unknown>

/**
 * Per kind, the step from version 1 to 2 at index 0, 2 to 3 at index 1, and so on.
 *
 * EMPTY, and correctly so: version 1 is the only shape neohab has ever written. The machinery is
 * here, and exercised by its tests with migrations of their own, so that the first real one is a
 * single function in a list rather than a mechanism invented under pressure.
 */
export const MIGRATIONS: Record<ComponentKind, Migration[]> = {
  dashboard: [],
  theme: [],
  widgetdef: [],
  icon: [],
  background: [],
  settings: []
}

/** Which kind a component uid names, or null for anything that is not ours. */
export function kindOf(uid: string): ComponentKind | null {
  if (uid === SETTINGS_UID) return 'settings'
  if (uid.startsWith(DASHBOARD_PREFIX)) return 'dashboard'
  if (uid.startsWith(THEME_PREFIX)) return 'theme'
  if (uid.startsWith(WIDGETDEF_PREFIX)) return 'widgetdef'
  if (uid.startsWith(ICON_PREFIX)) return 'icon'
  if (uid.startsWith(BACKGROUND_PREFIX)) return 'background'
  return null
}

/**
 * The version a stored config claims.
 *
 * Forgiving on purpose. Gson echoes whole numbers as `1.0`, a hand edit may quote it, and a
 * config written before the field existed has none at all - all of those are version 1, which is
 * the only version that has ever existed. Only a value that is genuinely a larger number counts
 * as newer, so no amount of malformed input can make a config look like it came from the future
 * and lock a user out of their own dashboards.
 */
export function versionOf(config: unknown): number {
  if (!config || typeof config !== 'object') return 1
  const raw = (config as Record<string, unknown>).version
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return 1
  // A rounded-down float means Gson's `1.0`; a fraction is nonsense and is treated as its floor.
  return Math.max(1, Math.floor(n))
}

export type MigrateResult =
  /** Usable. `migrated` is true if any step ran, so the caller can offer to write it back. */
  | { status: 'ok'; config: Record<string, unknown>; from: number; migrated: boolean }
  /** Written by a newer neohab. Left strictly alone - see the note at the top of this file. */
  | { status: 'future'; from: number; expected: number }

/**
 * Bring one component's config up to this build's shape, or refuse it.
 *
 * Both tables are parameters so the tests can drive the runner through a world with several
 * versions in it: with one version and no migrations, every branch below is unreachable, and an
 * unexercised migration runner is one that gets its ordering wrong the first time it matters.
 * Production callers pass neither.
 */
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

  // Steps are applied in order, one version at a time, and the version field is advanced with
  // them - so a half-finished chain could never be mistaken for a finished one.
  let current = base
  const steps = table[kind] ?? []
  for (let v = from; v < expected; v++) {
    const step = steps[v - 1]
    current = step ? { ...step(current) } : current
    current.version = v + 1
  }
  return { status: 'ok', config: current, from, migrated: true }
}
