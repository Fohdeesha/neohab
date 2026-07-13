/**
 * Configuration store.
 *
 * All neohab configuration lives on the server as UI components in the `neohab:config`
 * namespace, loaded with one list call:
 *   - `dashboard:<id>` (component `neohab:dashboard`) - one per dashboard
 *   - `theme:<id>`     (component `neohab:theme`)     - custom themes
 *   - `settings`       (component `neohab:settings`)  - global app settings
 * Reads are public; saving requires an admin login. With no server dashboards the Home screen
 * shows a first-run welcome instead.
 */
import { create } from 'zustand'
import { addComponent, deleteComponent, listComponents, updateComponent } from '../api/components'
import type { UIComponent } from '../api/types'
import type { Dashboard } from '../model/dashboard'
import type { CustomWidgetDef } from '../model/widgetdef'
import type { Theme } from '../themes/themes'

const DASHBOARD_PREFIX = 'dashboard:'
const THEME_PREFIX = 'theme:'
const WIDGETDEF_PREFIX = 'widgetdef:'
const SETTINGS_UID = 'settings'

const DASHBOARD_COMPONENT = 'neohab:dashboard'
const THEME_COMPONENT = 'neohab:theme'
const WIDGETDEF_COMPONENT = 'neohab:widgetdef'
const SETTINGS_COMPONENT = 'neohab:settings'

export interface AppSettings {
  version: number
  theme: string
  /** Tier-2 sandboxed JavaScript widgets only run when an admin has enabled them. */
  allowJsWidgets?: boolean
}

const defaultSettings = (): AppSettings => ({ version: 1, theme: 'dark' })

interface ConfigState {
  dashboards: Dashboard[]
  customThemes: Theme[]
  widgetDefs: CustomWidgetDef[]
  settings: AppSettings
  /** Component uids that exist on the server (decides create vs update on save). */
  serverUids: Set<string>
  loading: boolean
  loaded: boolean
  error: string | null
}

export const useConfigStore = create<ConfigState>(() => ({
  dashboards: [],
  customThemes: [],
  widgetDefs: [],
  settings: defaultSettings(),
  serverUids: new Set<string>(),
  loading: false,
  loaded: false,
  error: null,
}))

const dashboardComponent = (d: Dashboard): UIComponent<Dashboard> => ({
  uid: DASHBOARD_PREFIX + d.id,
  component: DASHBOARD_COMPONENT,
  config: d,
})

const themeComponent = (t: Theme): UIComponent<Theme> => ({
  uid: THEME_PREFIX + t.id,
  component: THEME_COMPONENT,
  config: t,
})

const settingsComponent = (s: AppSettings): UIComponent<AppSettings> => ({
  uid: SETTINGS_UID,
  component: SETTINGS_COMPONENT,
  config: s,
})

const widgetDefComponent = (d: CustomWidgetDef): UIComponent<CustomWidgetDef> => ({
  uid: WIDGETDEF_PREFIX + d.id,
  component: WIDGETDEF_COMPONENT,
  config: d,
})

function parseComponents(components: UIComponent[]) {
  const dashboards: Dashboard[] = []
  const customThemes: Theme[] = []
  const widgetDefs: CustomWidgetDef[] = []
  let settings = defaultSettings()
  for (const c of components) {
    if (c.uid.startsWith(DASHBOARD_PREFIX)) dashboards.push(c.config as unknown as Dashboard)
    else if (c.uid.startsWith(THEME_PREFIX)) customThemes.push(c.config as unknown as Theme)
    else if (c.uid.startsWith(WIDGETDEF_PREFIX)) widgetDefs.push(c.config as unknown as CustomWidgetDef)
    else if (c.uid === SETTINGS_UID) settings = { ...defaultSettings(), ...(c.config as Partial<AppSettings>) }
  }
  widgetDefs.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
  // stable, predictable Home ordering (component list order is storage-arbitrary)
  dashboards.sort((a, b) => a.name.localeCompare(b.name))
  return { dashboards, customThemes, widgetDefs, settings }
}

export async function loadConfig(): Promise<void> {
  useConfigStore.setState({ loading: true, error: null })
  try {
    const components = await listComponents()
    const serverUids = new Set(components.map((c) => c.uid))
    const { dashboards, customThemes, widgetDefs, settings } = parseComponents(components)
    useConfigStore.setState({
      dashboards,
      customThemes,
      widgetDefs,
      settings,
      serverUids,
      loading: false,
      loaded: true,
    })
  } catch (err) {
    // Server unreachable - render anyway so the welcome/error state shows.
    useConfigStore.setState({
      dashboards: [],
      customThemes: [],
      widgetDefs: [],
      settings: defaultSettings(),
      serverUids: new Set<string>(),
      loading: false,
      loaded: true,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function upsert<C>(component: UIComponent<C>): Promise<void> {
  const exists = useConfigStore.getState().serverUids.has(component.uid)
  if (exists) await updateComponent(component)
  else await addComponent(component)
  useConfigStore.setState((s) => ({ serverUids: new Set([...s.serverUids, component.uid]) }))
}

export function getDashboard(id: string): Dashboard | undefined {
  return useConfigStore.getState().dashboards.find((d) => d.id === id)
}

/** Persist a dashboard to the server. Requires an admin token. */
export async function saveDashboard(dashboard: Dashboard): Promise<void> {
  await upsert(dashboardComponent(dashboard))
  useConfigStore.setState((s) => {
    const others = s.dashboards.filter((d) => d.id !== dashboard.id)
    const dashboards = [...others, dashboard].sort((a, b) => a.name.localeCompare(b.name))
    return { dashboards }
  })
}

/** Delete a dashboard. Dashboards that never reached the server (demo) are removed locally. */
export async function deleteDashboard(id: string): Promise<void> {
  const uid = DASHBOARD_PREFIX + id
  if (useConfigStore.getState().serverUids.has(uid)) await deleteComponent(uid)
  useConfigStore.setState((s) => ({
    dashboards: s.dashboards.filter((d) => d.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== uid)),
  }))
}

/**
 * Update settings locally and try to persist. Persistence failures (e.g. not signed in) leave
 * the local change in place; the caller may surface the returned error.
 */
export async function saveSettings(patch: Partial<AppSettings>): Promise<string | null> {
  const next = { ...useConfigStore.getState().settings, ...patch }
  useConfigStore.setState({ settings: next })
  try {
    await upsert(settingsComponent(next))
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** Upsert an arbitrary component into the neohab namespace (used by the importer). */
export async function saveRawComponent(component: UIComponent): Promise<void> {
  await upsert(component)
}

export async function saveTheme(theme: Theme): Promise<void> {
  await upsert(themeComponent(theme))
  useConfigStore.setState((s) => {
    const others = s.customThemes.filter((t) => t.id !== theme.id)
    return { customThemes: [...others, theme] }
  })
}

export async function deleteTheme(id: string): Promise<void> {
  await deleteComponent(THEME_PREFIX + id)
  useConfigStore.setState((s) => ({
    customThemes: s.customThemes.filter((t) => t.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== THEME_PREFIX + id)),
  }))
}

export async function saveWidgetDef(def: CustomWidgetDef): Promise<void> {
  await upsert(widgetDefComponent(def))
  useConfigStore.setState((s) => {
    const others = s.widgetDefs.filter((d) => d.id !== def.id)
    return { widgetDefs: [...others, def].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id)) }
  })
}

export async function deleteWidgetDef(id: string): Promise<void> {
  await deleteComponent(WIDGETDEF_PREFIX + id)
  useConfigStore.setState((s) => ({
    widgetDefs: s.widgetDefs.filter((d) => d.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== WIDGETDEF_PREFIX + id)),
  }))
}

/* ------------------------------- backup / restore ------------------------------- */

export interface ExportBundle {
  manifest: {
    app: 'neohab'
    formatVersion: 1
    exportedAt: string
  }
  components: UIComponent[]
}

/** Build a full-configuration backup. Uses live server components when they exist. */
export async function buildExportBundle(): Promise<ExportBundle> {
  const s = useConfigStore.getState()
  let components: UIComponent[]
  if (s.serverUids.size > 0) {
    components = await listComponents()
  } else {
    // Nothing saved yet - export the current in-memory configuration.
    components = [
      ...s.dashboards.map((d) => dashboardComponent(d)),
      ...s.customThemes.map((t) => themeComponent(t)),
      settingsComponent(s.settings),
    ] as unknown as UIComponent[]
  }
  return {
    manifest: { app: 'neohab', formatVersion: 1, exportedAt: new Date().toISOString() },
    components,
  }
}

/** Validate a parsed backup; returns an error message or null. */
export function validateBundle(bundle: unknown): string | null {
  const b = bundle as Partial<ExportBundle> | null
  if (!b || typeof b !== 'object') return 'Not a neohab backup file'
  if (b.manifest?.app !== 'neohab') return 'Not a neohab backup file'
  if (b.manifest.formatVersion !== 1) return `Unsupported backup version: ${String(b.manifest.formatVersion)}`
  if (!Array.isArray(b.components)) return 'Backup contains no components'
  if (b.components.some((c) => typeof c?.uid !== 'string' || typeof c?.component !== 'string')) {
    return 'Backup contains invalid components'
  }
  return null
}

export type ImportMode = 'replace' | 'merge'

/**
 * Import a backup bundle, then reload. Requires an admin token.
 *   - replace: the bundle becomes the entire configuration (everything else is deleted)
 *   - merge:   existing components are kept; components present in both are overwritten
 *              by the bundle's version
 */
export async function importBundle(bundle: ExportBundle, mode: ImportMode): Promise<void> {
  const existing = await listComponents()
  if (mode === 'replace') {
    for (const c of existing) {
      await deleteComponent(c.uid)
    }
    for (const c of bundle.components) {
      await addComponent(c)
    }
  } else {
    const have = new Set(existing.map((c) => c.uid))
    for (const c of bundle.components) {
      if (have.has(c.uid)) await updateComponent(c)
      else await addComponent(c)
    }
  }
  await loadConfig()
}
