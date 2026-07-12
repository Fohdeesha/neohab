/**
 * Configuration store.
 *
 * All neohab configuration lives on the server as UI components in the `neohab:config`
 * namespace, loaded with one list call:
 *   - `dashboard:<id>` (component `neohab:dashboard`) - one per dashboard
 *   - `theme:<id>`     (component `neohab:theme`)     - custom themes
 *   - `settings`       (component `neohab:settings`)  - global app settings
 * Reads are public; saving requires an admin login. With no server dashboards a built-in demo
 * is shown so the UI is immediately usable.
 */
import { create } from 'zustand'
import { addComponent, deleteComponent, listComponents, updateComponent } from '../api/components'
import type { UIComponent } from '../api/types'
import type { Dashboard } from '../model/dashboard'
import type { Theme } from '../themes/themes'
import { demoDashboard } from './demoDashboard'

const DASHBOARD_PREFIX = 'dashboard:'
const THEME_PREFIX = 'theme:'
const SETTINGS_UID = 'settings'

const DASHBOARD_COMPONENT = 'neohab:dashboard'
const THEME_COMPONENT = 'neohab:theme'
const SETTINGS_COMPONENT = 'neohab:settings'

export interface AppSettings {
  version: number
  theme: string
}

const defaultSettings = (): AppSettings => ({ version: 1, theme: 'dark' })

interface ConfigState {
  dashboards: Dashboard[]
  customThemes: Theme[]
  settings: AppSettings
  /** Component uids that exist on the server (decides create vs update on save). */
  serverUids: Set<string>
  loading: boolean
  loaded: boolean
  usingDemo: boolean
  error: string | null
}

export const useConfigStore = create<ConfigState>(() => ({
  dashboards: [],
  customThemes: [],
  settings: defaultSettings(),
  serverUids: new Set<string>(),
  loading: false,
  loaded: false,
  usingDemo: false,
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

function parseComponents(components: UIComponent[]) {
  const dashboards: Dashboard[] = []
  const customThemes: Theme[] = []
  let settings = defaultSettings()
  for (const c of components) {
    if (c.uid.startsWith(DASHBOARD_PREFIX)) dashboards.push(c.config as unknown as Dashboard)
    else if (c.uid.startsWith(THEME_PREFIX)) customThemes.push(c.config as unknown as Theme)
    else if (c.uid === SETTINGS_UID) settings = { ...defaultSettings(), ...(c.config as Partial<AppSettings>) }
  }
  return { dashboards, customThemes, settings }
}

export async function loadConfig(): Promise<void> {
  useConfigStore.setState({ loading: true, error: null })
  try {
    const components = await listComponents()
    const serverUids = new Set(components.map((c) => c.uid))
    const { dashboards, customThemes, settings } = parseComponents(components)
    useConfigStore.setState({
      dashboards: dashboards.length > 0 ? dashboards : [demoDashboard()],
      customThemes,
      settings,
      serverUids,
      usingDemo: dashboards.length === 0,
      loading: false,
      loaded: true,
    })
  } catch (err) {
    // Server unreachable - still show the demo so the app renders.
    useConfigStore.setState({
      dashboards: [demoDashboard()],
      customThemes: [],
      settings: defaultSettings(),
      serverUids: new Set<string>(),
      usingDemo: true,
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
    return { dashboards: [...others, dashboard], usingDemo: false }
  })
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
    // Nothing saved yet - export the current in-memory configuration (demo included).
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

/**
 * Replace the entire server-side configuration with the bundle's contents, then reload.
 * Requires an admin token.
 */
export async function importBundle(bundle: ExportBundle): Promise<void> {
  const existing = await listComponents()
  for (const c of existing) {
    await deleteComponent(c.uid)
  }
  for (const c of bundle.components) {
    await addComponent(c)
  }
  await loadConfig()
}
