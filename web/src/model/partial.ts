import type { UIComponent } from '../api/types'
import { BG_REF_PREFIX } from './background'
import { BACKGROUND_PREFIX, DASHBOARD_PREFIX, ICON_PREFIX, THEME_PREFIX, WIDGETDEF_PREFIX, nextFreeId } from './components'
import type { Dashboard } from './dashboard'
import { kindOf, migrateConfig } from './schema'

export const ICON_REF_PREFIX = 'custom:'

export type PartialKind = 'dashboard' | 'widgetdef' | 'theme'

export const PARTIAL_FORMAT_VERSION = 2

export interface PartialBundle {
  manifest: {
    app: 'neohab'
    formatVersion: number
    exportedAt: string
    kind: PartialKind
    primary: string
  }
  components: UIComponent[]
}

const PREFIX_OF: Record<PartialKind, string> = {
  dashboard: DASHBOARD_PREFIX,
  widgetdef: WIDGETDEF_PREFIX,
  theme: THEME_PREFIX
}

export function partialUid(kind: PartialKind, id: string): string {
  return PREFIX_OF[kind] + id
}

// the only uids a partial file may carry - one naming `settings` would otherwise be written straight over the
// global settings
const ALLOWED_PREFIXES = [DASHBOARD_PREFIX, WIDGETDEF_PREFIX, THEME_PREFIX, ICON_PREFIX, BACKGROUND_PREFIX]

interface Refs {
  widgetdefs: Set<string>
  icons: Set<string>
  backgrounds: Set<string>
}

const emptyRefs = (): Refs => ({
  widgetdefs: new Set<string>(),
  icons: new Set<string>(),
  backgrounds: new Set<string>()
})

function scan(value: unknown, key: string, refs: Refs): void {
  if (typeof value === 'string') {
    const v = value.trim()
    if (!v) return
    if (key === 'customwidget') refs.widgetdefs.add(v)
    else if (v.startsWith(ICON_REF_PREFIX)) refs.icons.add(v.slice(ICON_REF_PREFIX.length))
    else if (v.startsWith(BG_REF_PREFIX)) refs.backgrounds.add(v.slice(BG_REF_PREFIX.length))
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) scan(v, key, refs)
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) scan(v, k, refs)
  }
}

export function referencedUids(component: UIComponent): Set<string> {
  const refs = emptyRefs()
  scan(component.config, '', refs)
  const out = new Set<string>()
  for (const id of refs.widgetdefs) out.add(WIDGETDEF_PREFIX + id)
  for (const id of refs.icons) out.add(ICON_PREFIX + id)
  for (const id of refs.backgrounds) out.add(BACKGROUND_PREFIX + id)
  return out
}

export interface DependencyResult {
  components: UIComponent[]
  missing: string[]
}

export function collectDependencies(primary: UIComponent, all: UIComponent[]): DependencyResult {
  const byUid = new Map(all.map((c) => [c.uid, c]))
  const found = new Map<string, UIComponent>()
  const missing: string[] = []
  const seen = new Set<string>([primary.uid])
  const queue: UIComponent[] = [primary]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    const refs = emptyRefs()
    scan(current.config, '', refs)
    const groups: [string, Set<string>][] = [
      [WIDGETDEF_PREFIX, refs.widgetdefs],
      [ICON_PREFIX, refs.icons],
      [BACKGROUND_PREFIX, refs.backgrounds]
    ]
    for (const [prefix, ids] of groups) {
      for (const id of ids) {
        const uid = prefix + id
        if (seen.has(uid)) continue
        seen.add(uid)
        const dep = byUid.get(uid)
        if (!dep) {
          missing.push(uid)
          continue
        }
        found.set(uid, dep)
        queue.push(dep)
      }
    }
  }

  const rank = (uid: string) => (uid.startsWith(WIDGETDEF_PREFIX) ? 0 : uid.startsWith(ICON_PREFIX) ? 1 : 2)
  const components = [...found.values()].sort((a, b) => rank(a.uid) - rank(b.uid) || a.uid.localeCompare(b.uid))
  return { components, missing: missing.sort() }
}

export function buildPartialBundle(
  kind: PartialKind,
  id: string,
  all: UIComponent[],
  exportedAt: string
): { bundle: PartialBundle; missing: string[] } | null {
  const uid = partialUid(kind, id)
  const primary = all.find((c) => c.uid === uid)
  if (!primary) return null
  const { components, missing } = collectDependencies(primary, all)
  return {
    bundle: {
      manifest: { app: 'neohab', formatVersion: PARTIAL_FORMAT_VERSION, exportedAt, kind, primary: uid },
      components: [primary, ...components]
    },
    missing
  }
}

export function partialFileName(kind: PartialKind, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || kind
  return `neohab-${kind}-${safe}.json`
}

export function looksPartial(value: unknown): boolean {
  const b = value as PartialBundle | null
  return Boolean(b && typeof b === 'object' && b.manifest?.app === 'neohab' && typeof b.manifest?.kind === 'string')
}

export function validatePartialBundle(value: unknown): string | null {
  const b = value as PartialBundle | null
  if (!b || typeof b !== 'object' || b.manifest?.app !== 'neohab') return 'Not a neohab file'
  if (b.manifest.formatVersion !== PARTIAL_FORMAT_VERSION) {
    return `Unsupported file version: ${String(b.manifest.formatVersion)}`
  }
  if (b.manifest.kind !== 'dashboard' && b.manifest.kind !== 'widgetdef' && b.manifest.kind !== 'theme') {
    return `Unsupported file contents: ${String(b.manifest.kind)}`
  }
  if (!Array.isArray(b.components) || b.components.length === 0) return 'File contains no components'
  if (b.components.some((c) => typeof c?.uid !== 'string' || typeof c?.component !== 'string')) {
    return 'File contains invalid components'
  }
  const stray = b.components.find((c) => !ALLOWED_PREFIXES.some((p) => c.uid.startsWith(p)))
  if (stray) return `File contains something this kind of file may not carry: ${stray.uid}`
  if (typeof b.manifest.primary !== 'string' || !b.components.some((c) => c.uid === b.manifest.primary)) {
    return 'File does not contain the component it describes'
  }
  if (!b.manifest.primary.startsWith(PREFIX_OF[b.manifest.kind])) {
    return `File says it holds a ${b.manifest.kind}, but describes ${b.manifest.primary}`
  }
  return null
}

export type EntryStatus = 'new' | 'identical' | 'conflict'

export interface PlanEntry {
  uid: string
  status: EntryStatus
}

export interface PartialPlan {
  kind: PartialKind
  name: string
  primary: PlanEntry
  dependencies: PlanEntry[]
  conflicts: string[]
}

function canonical(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        if (k === 'timestamp') continue
        out[k] = norm((v as Record<string, unknown>)[k])
      }
      return out
    }
    return v
  }
  return JSON.stringify(norm(value))
}

// "identical" has to mean "importing this would change nothing once it is loaded", not "these two files
// match byte for byte". A component still stored at an older version is migrated the moment the app reads
// it, so an export of it carries the newer shape and would otherwise read as a conflict with its own source.
function comparable(c: UIComponent): unknown {
  const kind = kindOf(c.uid)
  if (!kind) return c.config
  const result = migrateConfig(kind, c.config)
  return result.status === 'ok' ? result.config : c.config
}

function statusOf(incoming: UIComponent, existing: Map<string, UIComponent>): EntryStatus {
  const have = existing.get(incoming.uid)
  if (!have) return 'new'
  return canonical({ component: have.component, config: comparable(have) }) ===
    canonical({ component: incoming.component, config: comparable(incoming) })
    ? 'identical'
    : 'conflict'
}

function displayName(c: UIComponent): string {
  const config = c.config as Record<string, unknown> | undefined
  const name = config?.name
  return typeof name === 'string' && name.trim() !== '' ? name : c.uid
}

export function planPartialImport(bundle: PartialBundle, existing: UIComponent[]): PartialPlan {
  const have = new Map(existing.map((c) => [c.uid, c]))
  const primaryComponent = bundle.components.find((c) => c.uid === bundle.manifest.primary)
  const entries = bundle.components.map((c) => ({ uid: c.uid, status: statusOf(c, have) }))
  const primary = entries.find((e) => e.uid === bundle.manifest.primary) ?? { uid: bundle.manifest.primary, status: 'new' as EntryStatus }
  return {
    kind: bundle.manifest.kind,
    name: primaryComponent ? displayName(primaryComponent) : bundle.manifest.primary,
    primary,
    dependencies: entries.filter((e) => e.uid !== bundle.manifest.primary),
    conflicts: entries.filter((e) => e.status === 'conflict').map((e) => e.uid)
  }
}

export type PartialImportMode = 'copy' | 'overwrite'

export interface ResolvedPartialImport {
  components: UIComponent[]
  renamed: [string, string][]
  reused: string[]
  primaryUid: string
}

const idOf = (uid: string): string => uid.slice(uid.indexOf(':') + 1)
const prefixOf = (uid: string): string => uid.slice(0, uid.indexOf(':') + 1)

function copyName(name: string, newId: string): string {
  const m = /-(\d+)$/.exec(newId)
  return m ? `${name} (${m[1]})` : `${name} (copy)`
}

function rewriteRefs(
  value: unknown,
  key: string,
  maps: { widgetdefs: Map<string, string>; icons: Map<string, string>; backgrounds: Map<string, string> }
): unknown {
  if (typeof value === 'string') {
    const v = value.trim()
    if (key === 'customwidget') return maps.widgetdefs.get(v) ?? value
    if (v.startsWith(ICON_REF_PREFIX)) {
      const to = maps.icons.get(v.slice(ICON_REF_PREFIX.length))
      return to ? ICON_REF_PREFIX + to : value
    }
    if (v.startsWith(BG_REF_PREFIX)) {
      const to = maps.backgrounds.get(v.slice(BG_REF_PREFIX.length))
      return to ? BG_REF_PREFIX + to : value
    }
    return value
  }
  if (Array.isArray(value)) return value.map((v) => rewriteRefs(v, key, maps))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = rewriteRefs(v, k, maps)
    return out
  }
  return value
}

export function resolvePartialImport(
  bundle: PartialBundle,
  existing: UIComponent[],
  mode: PartialImportMode,
  newWidgetId: () => string
): ResolvedPartialImport {
  const have = new Map(existing.map((c) => [c.uid, c]))
  const takenByPrefix = new Map<string, Set<string>>()
  for (const c of existing) {
    const p = prefixOf(c.uid)
    if (!p) continue
    const set = takenByPrefix.get(p) ?? new Set<string>()
    set.add(idOf(c.uid))
    takenByPrefix.set(p, set)
  }

  const maps = {
    widgetdefs: new Map<string, string>(),
    icons: new Map<string, string>(),
    backgrounds: new Map<string, string>()
  }
  const mapFor = (prefix: string) =>
    prefix === WIDGETDEF_PREFIX
      ? maps.widgetdefs
      : prefix === ICON_PREFIX
        ? maps.icons
        : prefix === BACKGROUND_PREFIX
          ? maps.backgrounds
          : null

  const status = new Map(bundle.components.map((c) => [c.uid, statusOf(c, have)]))

  const toRename = new Set<string>()
  if (mode === 'copy') {
    for (const [uid, st] of status) if (st === 'conflict') toRename.add(uid)
    const inBundle = new Set(bundle.components.map((c) => c.uid))
    for (let changed = true; changed;) {
      changed = false
      for (const c of bundle.components) {
        if (toRename.has(c.uid)) continue
        if (status.get(c.uid) !== 'identical') continue // a 'new' uid is free; only refs get rewritten
        if ([...referencedUids(c)].some((dep) => inBundle.has(dep) && toRename.has(dep))) {
          toRename.add(c.uid)
          changed = true
        }
      }
    }
  }

  const renamed: [string, string][] = []
  const reused: string[] = []
  const target = new Map<string, string>()
  const skip = new Set<string>()

  for (const c of bundle.components) {
    if (toRename.has(c.uid)) {
      const prefix = prefixOf(c.uid)
      const taken = takenByPrefix.get(prefix) ?? new Set<string>()
      const newId = nextFreeId(idOf(c.uid), taken)
      taken.add(newId)
      takenByPrefix.set(prefix, taken)
      const newUid = prefix + newId
      target.set(c.uid, newUid)
      renamed.push([c.uid, newUid])
      const map = mapFor(prefix)
      if (map) map.set(idOf(c.uid), newId)
      continue
    }
    target.set(c.uid, c.uid)
    if (status.get(c.uid) === 'identical') {
      skip.add(c.uid)
      reused.push(c.uid)
    }
  }

  const components: UIComponent[] = []
  for (const c of bundle.components) {
    if (skip.has(c.uid)) continue
    const newUid = target.get(c.uid) ?? c.uid
    const newId = idOf(newUid)
    let config = rewriteRefs(c.config, '', maps) as Record<string, unknown>
    if (newUid !== c.uid) {
      config = { ...config, id: newId }
      if (typeof config.name === 'string') config.name = copyName(config.name, newId)
    }
    if (mode === 'copy' && c.uid.startsWith(DASHBOARD_PREFIX)) {
      config = withFreshWidgetIds(config as unknown as Dashboard, newWidgetId) as unknown as Record<string, unknown>
    }
    components.push({ ...c, uid: newUid, config: config as never })
  }

  return {
    components,
    renamed,
    reused,
    primaryUid: target.get(bundle.manifest.primary) ?? bundle.manifest.primary
  }
}

function withFreshWidgetIds(dashboard: Dashboard, newWidgetId: () => string): Dashboard {
  if (!Array.isArray(dashboard.widgets)) return dashboard
  const map = new Map<string, string>()
  const widgets = dashboard.widgets.map((w) => {
    const id = newWidgetId()
    if (typeof w.id === 'string') map.set(w.id, id)
    return { ...w, id }
  })
  const stackOrder = Array.isArray(dashboard.stackOrder) ? dashboard.stackOrder.map((id) => map.get(id) ?? id) : dashboard.stackOrder
  return { ...dashboard, widgets, ...(stackOrder ? { stackOrder } : {}) }
}
