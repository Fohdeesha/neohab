import { create } from 'zustand'
import { addComponent, deleteComponent, listComponents, updateComponent } from '../api/components'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
import i18n from '../i18n'
import { writeWithFallback } from '../api/write'
import type { UIComponent } from '../api/types'
import type { CustomBackground } from '../model/background'
import { collectBackgroundRefs } from '../model/background'
import type { CustomIcon } from '../model/customIcon'
import { newWidgetId, type Dashboard } from '../model/dashboard'
import {
  buildPartialBundle,
  planPartialImport,
  resolvePartialImport,
  type PartialBundle,
  type PartialImportMode,
  type PartialPlan
} from '../model/partial'
import type { CustomWidgetDef } from '../model/widgetdef'
import { exportableRule, isImportableSceneRule, NEOHAB_TAG, type SceneRule } from '../model/presets'
import { createOrUpdateRule, deleteRule, listRuleSummaries, listRulesFull, upsertRule } from '../api/rules'
import type { Theme } from '../themes/themes'

import {
  BACKGROUND_COMPONENT,
  BACKGROUND_PREFIX,
  DASHBOARD_COMPONENT,
  DASHBOARD_PREFIX,
  ICON_COMPONENT,
  ICON_PREFIX,
  SETTINGS_COMPONENT,
  SETTINGS_UID,
  THEME_COMPONENT,
  THEME_PREFIX,
  WIDGETDEF_COMPONENT,
  WIDGETDEF_PREFIX
} from '../model/components'
import { kindOf, migrateConfig } from '../model/schema'

export interface AppSettings {
  version: number
  theme: string
  allowJsWidgets?: boolean
  maxIconKB?: number
  sidebar?: boolean
  controlItem?: string
  background?: string
  speechItem?: string
  voiceButton?: boolean
  historyLimit?: number
  historyWindowMin?: number
  // absent means on: existing installs get live dragging without their settings being touched
  liveDrag?: boolean
  // where the stacked and tablet layouts take over, in px of dashboard width. Absent = the
  // built-in 840 / 1200; read through surfaceBounds(), which clamps and orders them
  phoneBelow?: number
  tabletBelow?: number
}

const defaultSettings = (): AppSettings => ({ version: 1, theme: 'dark', allowJsWidgets: true, sidebar: true })

interface ConfigState {
  dashboards: Dashboard[]
  customThemes: Theme[]
  widgetDefs: CustomWidgetDef[]
  customIcons: CustomIcon[]
  backgrounds: CustomBackground[]
  settings: AppSettings
  incompatible: UIComponent[]
  serverUids: Set<string>
  loading: boolean
  loaded: boolean
  error: string | null
  authRequired: boolean
}

export const useConfigStore = create<ConfigState>(() => ({
  dashboards: [],
  customThemes: [],
  widgetDefs: [],
  customIcons: [],
  backgrounds: [],
  settings: defaultSettings(),
  incompatible: [],
  serverUids: new Set<string>(),
  loading: false,
  loaded: false,
  error: null,
  authRequired: false
}))

const dashboardComponent = (d: Dashboard): UIComponent<Dashboard> => ({
  uid: DASHBOARD_PREFIX + d.id,
  component: DASHBOARD_COMPONENT,
  config: d
})

const themeComponent = (t: Theme): UIComponent<Theme> => ({
  uid: THEME_PREFIX + t.id,
  component: THEME_COMPONENT,
  config: t
})

const settingsComponent = (s: AppSettings): UIComponent<AppSettings> => ({
  uid: SETTINGS_UID,
  component: SETTINGS_COMPONENT,
  config: s
})

const widgetDefComponent = (d: CustomWidgetDef): UIComponent<CustomWidgetDef> => ({
  uid: WIDGETDEF_PREFIX + d.id,
  component: WIDGETDEF_COMPONENT,
  config: d
})

const iconComponent = (i: CustomIcon): UIComponent<CustomIcon> => ({
  uid: ICON_PREFIX + i.id,
  component: ICON_COMPONENT,
  config: i
})

const backgroundComponent = (b: CustomBackground): UIComponent<CustomBackground> => ({
  uid: BACKGROUND_PREFIX + b.id,
  component: BACKGROUND_COMPONENT,
  config: b
})

function parseComponents(components: UIComponent[]) {
  const dashboards: Dashboard[] = []
  const customThemes: Theme[] = []
  const widgetDefs: CustomWidgetDef[] = []
  const customIcons: CustomIcon[] = []
  const backgrounds: CustomBackground[] = []
  // kept whole rather than dropped: everything that decides what is unused has to be able to see them
  const incompatible: UIComponent[] = []
  let settings = defaultSettings()
  for (const c of components) {
    const kind = kindOf(c.uid)
    if (!kind) continue
    const result = migrateConfig(kind, c.config)
    if (result.status === 'future') {
      incompatible.push(c)
      continue
    }
    const config = named(result.config)
    if (kind === 'dashboard') dashboards.push(config as unknown as Dashboard)
    else if (kind === 'theme') customThemes.push(config as unknown as Theme)
    else if (kind === 'widgetdef') widgetDefs.push(config as unknown as CustomWidgetDef)
    else if (kind === 'icon') customIcons.push(config as unknown as CustomIcon)
    else if (kind === 'background') backgrounds.push(config as unknown as CustomBackground)
    else settings = { ...defaultSettings(), ...(config as Partial<AppSettings>) }
  }
  widgetDefs.sort(byName)
  customIcons.sort(byName)
  dashboards.sort(byName)
  return { dashboards, customThemes, widgetDefs, customIcons, backgrounds, settings, incompatible }
}

function byName<T extends { name?: string; id?: string }>(a: T, b: T): number {
  return String(a.name ?? a.id ?? '').localeCompare(String(b.name ?? b.id ?? ''))
}

// the name is drawn on nearly every screen at once, so a non-string one takes Home, the sidebar and Settings
// together
export function named(config: Record<string, unknown>): Record<string, unknown> {
  const name = config?.name
  if (name === undefined || typeof name === 'string') return config
  return { ...config, name: String(name) }
}

// a request with no timeout does not fail, it pends - a wall panel would sit on "loading" for ever
const LOAD_TIMEOUT_MS = 20_000

export async function loadConfig(): Promise<void> {
  useConfigStore.setState({ loading: true })
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), LOAD_TIMEOUT_MS)
  try {
    const components = await listComponents(abort.signal)
    const serverUids = new Set(components.map((c) => c.uid))
    const { dashboards, customThemes, widgetDefs, customIcons, backgrounds, settings, incompatible } = parseComponents(components)
    useConfigStore.setState({
      dashboards,
      customThemes,
      widgetDefs,
      customIcons,
      backgrounds,
      settings,
      incompatible,
      serverUids,
      loading: false,
      loaded: true,
      error: null,
      authRequired: false
    })
  } catch (err) {
    const timedOut = abort.signal.aborted
    useConfigStore.setState({
      dashboards: [],
      customThemes: [],
      widgetDefs: [],
      customIcons: [],
      backgrounds: [],
      settings: defaultSettings(),
      incompatible: [],
      serverUids: new Set<string>(),
      loading: false,
      loaded: true,
      error: timedOut ? i18n.t('the openHAB server did not answer in time') : errorText(err),
      authRequired: err instanceof ApiError && (err.status === 401 || err.status === 403)
    })
  } finally {
    clearTimeout(timer)
  }
}

export type ConfigWriteKind = 'single' | 'bulk'

let beforeWrite: ((kind: ConfigWriteKind) => Promise<void>) | null = null

export function onBeforeConfigWrite(fn: (kind: ConfigWriteKind) => Promise<void>): void {
  beforeWrite = fn
}

async function beforeConfigWrite(kind: ConfigWriteKind = 'single'): Promise<void> {
  if (beforeWrite) await beforeWrite(kind)
}

export async function beginBulkConfigWrite(): Promise<void> {
  await beforeConfigWrite('bulk')
}

// that belief can be out of date: another tab, or a restore, adds and removes components behind this one's
// back
async function upsert<C>(component: UIComponent<C>): Promise<void> {
  // a component this build refused to read is one it must never write
  if (useConfigStore.getState().incompatible.some((c) => c.uid === component.uid)) {
    throw new Error(`${component.uid} was written by a newer version of neohab and will not be overwritten by this one.`)
  }
  const exists = useConfigStore.getState().serverUids.has(component.uid)
  const update = () => updateComponent(component)
  const create = () => addComponent(component)
  const [first, second] = exists ? [update, create] : [create, update]
  await writeWithFallback(first, second)
  useConfigStore.setState((s) => ({ serverUids: new Set([...s.serverUids, component.uid]) }))
}

export function getDashboard(id: string): Dashboard | undefined {
  return useConfigStore.getState().dashboards.find((d) => d.id === id)
}

export async function saveDashboard(dashboard: Dashboard): Promise<void> {
  await beforeConfigWrite()
  await upsert(dashboardComponent(dashboard))
  useConfigStore.setState((s) => {
    const others = s.dashboards.filter((d) => d.id !== dashboard.id)
    const dashboards = [...others, dashboard].sort(byName)
    return { dashboards }
  })
}

export async function deleteDashboard(id: string): Promise<void> {
  await beforeConfigWrite()
  const uid = DASHBOARD_PREFIX + id
  if (useConfigStore.getState().serverUids.has(uid)) await deleteComponent(uid)
  useConfigStore.setState((s) => ({
    dashboards: s.dashboards.filter((d) => d.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== uid))
  }))
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<string | null> {
  const next = { ...useConfigStore.getState().settings, ...patch }
  useConfigStore.setState({ settings: next })
  await beforeConfigWrite()
  try {
    await upsert(settingsComponent(next))
    return null
  } catch (err) {
    return errorText(err)
  }
}

export async function saveRawComponent(component: UIComponent): Promise<void> {
  await beforeConfigWrite()
  await upsert(component)
}

export async function saveTheme(theme: Theme): Promise<void> {
  await beforeConfigWrite()
  await upsert(themeComponent(theme))
  useConfigStore.setState((s) => {
    const others = s.customThemes.filter((t) => t.id !== theme.id)
    return { customThemes: [...others, theme] }
  })
}

export async function deleteTheme(id: string): Promise<void> {
  await beforeConfigWrite()
  if (useConfigStore.getState().serverUids.has(THEME_PREFIX + id)) await deleteComponent(THEME_PREFIX + id)
  useConfigStore.setState((s) => ({
    customThemes: s.customThemes.filter((t) => t.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== THEME_PREFIX + id))
  }))
}

export async function saveWidgetDef(def: CustomWidgetDef): Promise<void> {
  await beforeConfigWrite()
  await upsert(widgetDefComponent(def))
  useConfigStore.setState((s) => {
    const others = s.widgetDefs.filter((d) => d.id !== def.id)
    return { widgetDefs: [...others, def].sort(byName) }
  })
}

export async function deleteWidgetDef(id: string): Promise<void> {
  await beforeConfigWrite()
  if (useConfigStore.getState().serverUids.has(WIDGETDEF_PREFIX + id)) await deleteComponent(WIDGETDEF_PREFIX + id)
  useConfigStore.setState((s) => ({
    widgetDefs: s.widgetDefs.filter((d) => d.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== WIDGETDEF_PREFIX + id))
  }))
}

export async function saveCustomIcon(icon: CustomIcon): Promise<void> {
  await beforeConfigWrite()
  await upsert(iconComponent(icon))
  useConfigStore.setState((s) => {
    const others = s.customIcons.filter((i) => i.id !== icon.id)
    return { customIcons: [...others, icon].sort(byName) }
  })
}

export async function deleteCustomIcon(id: string): Promise<void> {
  await beforeConfigWrite()
  if (useConfigStore.getState().serverUids.has(ICON_PREFIX + id)) await deleteComponent(ICON_PREFIX + id)
  useConfigStore.setState((s) => ({
    customIcons: s.customIcons.filter((i) => i.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== ICON_PREFIX + id))
  }))
}

export async function saveBackground(bg: CustomBackground): Promise<void> {
  await beforeConfigWrite()
  await upsert(backgroundComponent(bg))
  useConfigStore.setState((s) => {
    const others = s.backgrounds.filter((b) => b.id !== bg.id)
    return { backgrounds: [...others, bg] }
  })
}

export async function collectUnusedBackgrounds(alsoKeep: (string | undefined)[] = []): Promise<void> {
  const s = useConfigStore.getState()
  if (!s.loaded) return
  const referenced = collectBackgroundRefs([s.settings, s.dashboards, s.widgetDefs, s.incompatible, alsoKeep])
  for (const bg of s.backgrounds) {
    if (referenced.has(bg.id)) continue
    try {
      await deleteComponent(BACKGROUND_PREFIX + bg.id)
      useConfigStore.setState((st) => ({
        backgrounds: st.backgrounds.filter((b) => b.id !== bg.id),
        serverUids: new Set([...st.serverUids].filter((u) => u !== BACKGROUND_PREFIX + bg.id))
      }))
    } catch {
      // not signed in or transient - the next collection gets it
    }
  }
}

export interface ExportBundle {
  manifest: {
    app: 'neohab'
    formatVersion: 1
    exportedAt: string
  }
  components: UIComponent[]
  scenes?: SceneRule[]
}

export async function buildExportBundle(includeBackgrounds = true): Promise<ExportBundle> {
  const s = useConfigStore.getState()
  let components: UIComponent[]
  if (s.serverUids.size > 0) {
    components = await listComponents()
  } else {
    components = [
      settingsComponent(s.settings) as unknown as UIComponent,
      ...s.dashboards.map((d) => dashboardComponent(d)),
      ...s.customThemes.map((t) => themeComponent(t)),
      ...s.widgetDefs.map((d) => widgetDefComponent(d)),
      ...s.customIcons.map((i) => iconComponent(i)),
      ...s.backgrounds.map((b) => backgroundComponent(b))
    ] as unknown as UIComponent[]
  }
  if (!includeBackgrounds) {
    components = components.filter((c) => !c.uid.startsWith(BACKGROUND_PREFIX))
  }
  const rank = (c: UIComponent) =>
    c.uid === SETTINGS_UID
      ? 0
      : c.uid.startsWith(DASHBOARD_PREFIX)
        ? 1
        : c.uid.startsWith(BACKGROUND_PREFIX)
          ? 5
          : c.uid.startsWith(ICON_PREFIX)
            ? 4
            : c.uid.startsWith(WIDGETDEF_PREFIX)
              ? 3
              : 2
  components = components
    .map((c, i) => [c, i] as const)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
    .map(([c]) => c)
  const bundle: ExportBundle = {
    manifest: { app: 'neohab', formatVersion: 1, exportedAt: new Date().toISOString() },
    components
  }
  try {
    const rules = await listRulesFull(NEOHAB_TAG)
    bundle.scenes = rules.filter((r) => r.editable !== false && isImportableSceneRule(r)).map(exportableRule)
  } catch {
    // not an administrator, so the backup speaks only for the components
  }
  return bundle
}

export function validateBundle(bundle: unknown): string | null {
  const b = bundle as Partial<ExportBundle> | null
  if (!b || typeof b !== 'object') return 'Not a neohab backup file'
  if (b.manifest?.app !== 'neohab') return 'Not a neohab backup file'
  if (b.manifest.formatVersion !== 1) return `Unsupported backup version: ${String(b.manifest.formatVersion)}`
  if (!Array.isArray(b.components)) return 'Backup contains no components'
  if (b.components.some((c) => typeof c?.uid !== 'string' || typeof c?.component !== 'string')) {
    return 'Backup contains invalid components'
  }
  if (b.scenes !== undefined) {
    if (!Array.isArray(b.scenes) || !b.scenes.every((r) => isImportableSceneRule(r))) {
      return 'Backup contains invalid presets'
    }
  }
  return null
}

export type ImportMode = 'replace' | 'merge'

export async function importBundle(bundle: ExportBundle, mode: ImportMode): Promise<void> {
  await beforeConfigWrite('bulk')
  const existing = await listComponents()
  const have = new Set(existing.map((c) => c.uid))

  for (const c of bundle.components) {
    if (have.has(c.uid)) await updateComponent(c)
    else await addComponent(c)
  }

  if (mode === 'replace') {
    const keep = new Set(bundle.components.map((c) => c.uid))
    for (const c of existing) {
      if (!keep.has(c.uid)) await deleteComponent(c.uid)
    }
  }

  if (Array.isArray(bundle.scenes)) {
    const scenes = bundle.scenes.filter((r) => isImportableSceneRule(r))
    const haveRules = new Set((await listRuleSummaries().catch(() => [])).map((r) => r.uid))
    for (const r of scenes) {
      if (haveRules.has(r.uid)) await upsertRule(r)
      else await createOrUpdateRule(r)
    }
    if (mode === 'replace') {
      const keep = new Set(scenes.map((r) => r.uid))
      const existingRules = await listRulesFull(NEOHAB_TAG).catch(() => [] as SceneRule[])
      for (const r of existingRules) {
        if (r.editable !== false && isImportableSceneRule(r) && !keep.has(r.uid)) await deleteRule(r.uid)
      }
    }
  }
  await loadConfig()
}

async function allComponents(): Promise<UIComponent[]> {
  const s = useConfigStore.getState()
  if (s.serverUids.size > 0) return listComponents()
  return [
    settingsComponent(s.settings) as unknown as UIComponent,
    ...s.dashboards.map((d) => dashboardComponent(d)),
    ...s.customThemes.map((t) => themeComponent(t)),
    ...s.widgetDefs.map((d) => widgetDefComponent(d)),
    ...s.customIcons.map((i) => iconComponent(i)),
    ...s.backgrounds.map((b) => backgroundComponent(b))
  ] as unknown as UIComponent[]
}

export type PartialExport = { bundle: PartialBundle; missing: string[] }

export async function buildComponentExport(kind: 'widgetdef' | 'theme', id: string): Promise<PartialExport | null> {
  return buildPartialBundle(kind, id, await allComponents(), new Date().toISOString())
}

export async function buildDashboardExport(dashboard: Dashboard): Promise<PartialExport | null> {
  const uid = DASHBOARD_PREFIX + dashboard.id
  const rest = (await allComponents()).filter((c) => c.uid !== uid)
  const components = [dashboardComponent(dashboard) as unknown as UIComponent, ...rest]
  return buildPartialBundle('dashboard', dashboard.id, components, new Date().toISOString())
}

export async function planPartialImportOnServer(bundle: PartialBundle): Promise<PartialPlan> {
  return planPartialImport(bundle, await listComponents())
}

export interface PartialImportResult {
  primaryUid: string
  renamed: [string, string][]
  reused: string[]
  written: number
}

export async function importPartialBundle(bundle: PartialBundle, mode: PartialImportMode): Promise<PartialImportResult> {
  await beforeConfigWrite('bulk')
  const existing = await listComponents()
  const resolved = resolvePartialImport(bundle, existing, mode, newWidgetId)
  const have = new Set(existing.map((c) => c.uid))
  for (const c of resolved.components) {
    if (have.has(c.uid)) await updateComponent(c)
    else await addComponent(c)
  }
  await loadConfig()
  return {
    primaryUid: resolved.primaryUid,
    renamed: resolved.renamed,
    reused: resolved.reused,
    written: resolved.components.length
  }
}
