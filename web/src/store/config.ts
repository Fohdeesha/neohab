/**
 * Configuration store.
 *
 * All neohab configuration lives on the server as UI components in the `neohab:config`
 * namespace, loaded with one list call:
 *   - `dashboard:<id>` (component `neohab:dashboard`) - one per dashboard
 *   - `theme:<id>`     (component `neohab:theme`)     - custom themes
 *   - `icon:<id>`      (component `neohab:icon`)      - user-uploaded icons (data URIs)
 *   - `settings`       (component `neohab:settings`)  - global app settings
 * Reads are public; saving requires an admin login. With no server dashboards the Home screen
 * shows a first-run welcome instead.
 *
 * Every write here passes through `beforeConfigWrite`, which is where the version history takes
 * the restore point for the state about to be replaced (store/history.ts).
 */
import { create } from 'zustand'
import { addComponent, deleteComponent, listComponents, updateComponent } from '../api/components'
import { ApiError } from '../api/client'
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
  type PartialPlan,
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
  WIDGETDEF_PREFIX,
} from '../model/components'
import { kindOf, migrateConfig } from '../model/schema'

export interface AppSettings {
  version: number
  theme: string
  /**
   * Tier-2 JavaScript widgets. On by default: they only ever run in a sandbox that cannot reach
   * the app, the session or the token, which is a tighter box than the frame widget puts an
   * embedded page in. An admin can still turn them off to stop them running at all.
   */
  allowJsWidgets?: boolean
  /** Per-icon upload size cap in KB (default DEFAULT_MAX_ICON_KB). */
  maxIconKB?: number
  /** Show the navigation sidebar (☰ in the top-left of every screen). On by default. */
  sidebar?: boolean
  /**
   * Dashboard-control item: a String item whose state names a dashboard (id, or name
   * case-insensitively). When it changes, devices that follow it switch to that dashboard -
   * the classic way to drive wall panels from a rule. Whether a given device follows it is a
   * per-device choice (kiosk-mode devices follow by default).
   */
  controlItem?: string
  /**
   * Show the editing affordances to devices that are NOT signed in as an administrator. Off
   * by default: like openHAB's own UIs, visitors get a view-only panel (widgets still work,
   * nothing about the panel can be changed) until they sign in via Settings > Account.
   * Turning this on shows every editing control to everyone; the server still decides which
   * writes it accepts. Replaces the old `lockEditing` key, which is ignored if present.
   */
  allowAnonymousEditing?: boolean
  /**
   * Default background image behind every dashboard and the Home screen - a URL, or
   * `bg:<id>` for an uploaded one. A dashboard's own `background` overrides it.
   */
  background?: string
  /**
   * Speech item (HABPanel's `speech_synthesis_item`): a String item whose state changes are
   * spoken aloud through the browser's speech synthesis. Whether a given device actually
   * speaks (and with which voice) is that device's own choice.
   */
  speechItem?: string
  /** Voice-input microphone button in the dashboard header (where supported). On by default. */
  voiceButton?: boolean
  /**
   * Restore points kept in the version history (default DEFAULT_HISTORY_LIMIT). 0 turns the
   * history off, so nothing is captured and nothing is stored.
   */
  historyLimit?: number
  /**
   * Minutes of quiet before the next change starts a new restore point (default
   * DEFAULT_HISTORY_WINDOW_MIN), so one editing session leaves one point rather than dozens.
   */
  historyWindowMin?: number
}

const defaultSettings = (): AppSettings => ({ version: 1, theme: 'dark', allowJsWidgets: true, sidebar: true })

interface ConfigState {
  dashboards: Dashboard[]
  customThemes: Theme[]
  widgetDefs: CustomWidgetDef[]
  customIcons: CustomIcon[]
  backgrounds: CustomBackground[]
  settings: AppSettings
  /**
   * Components a newer neohab wrote, kept exactly as they were read. Not part of the working
   * configuration - this build cannot be sure what they mean - but visible to everything that
   * decides what is unused, and refused by the save path so they are never overwritten.
   */
  incompatible: UIComponent[]
  /** Component uids that exist on the server (decides create vs update on save). */
  serverUids: Set<string>
  loading: boolean
  loaded: boolean
  error: string | null
  /**
   * The configuration could not be read because this device is not signed in - openHAB's
   * `implicitUserRole` is off, which is the normal posture on a secured server. Kept apart
   * from `error` because the remedy is different: not "something broke" but "sign in".
   */
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
  authRequired: false,
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

const iconComponent = (i: CustomIcon): UIComponent<CustomIcon> => ({
  uid: ICON_PREFIX + i.id,
  component: ICON_COMPONENT,
  config: i,
})

const backgroundComponent = (b: CustomBackground): UIComponent<CustomBackground> => ({
  uid: BACKGROUND_PREFIX + b.id,
  component: BACKGROUND_COMPONENT,
  config: b,
})

function parseComponents(components: UIComponent[]) {
  const dashboards: Dashboard[] = []
  const customThemes: Theme[] = []
  const widgetDefs: CustomWidgetDef[] = []
  const customIcons: CustomIcon[] = []
  const backgrounds: CustomBackground[] = []
  // Components written by a NEWER neohab. Kept whole rather than dropped: everything that decides
  // what is unused - the background collector above all - has to be able to see them, or this
  // build would delete the images belonging to a dashboard it merely could not read.
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
    const config = result.config
    if (kind === 'dashboard') dashboards.push(config as unknown as Dashboard)
    else if (kind === 'theme') customThemes.push(config as unknown as Theme)
    else if (kind === 'widgetdef') widgetDefs.push(config as unknown as CustomWidgetDef)
    else if (kind === 'icon') customIcons.push(config as unknown as CustomIcon)
    else if (kind === 'background') backgrounds.push(config as unknown as CustomBackground)
    else settings = { ...defaultSettings(), ...(config as Partial<AppSettings>) }
  }
  // stable, predictable ordering: component list order is storage-arbitrary
  widgetDefs.sort(byName)
  customIcons.sort(byName)
  dashboards.sort(byName)
  return { dashboards, customThemes, widgetDefs, customIcons, backgrounds, settings, incompatible }
}

/**
 * Display order for anything with a name. Tolerates a nameless or half-written component: a
 * hand-edited config must not throw in a comparator and take the whole configuration down.
 */
function byName<T extends { name?: string; id?: string }>(a: T, b: T): number {
  return String(a.name ?? a.id ?? '').localeCompare(String(b.name ?? b.id ?? ''))
}

export async function loadConfig(): Promise<void> {
  useConfigStore.setState({ loading: true, error: null, authRequired: false })
  try {
    const components = await listComponents()
    const serverUids = new Set(components.map((c) => c.uid))
    const { dashboards, customThemes, widgetDefs, customIcons, backgrounds, settings, incompatible } =
      parseComponents(components)
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
    })
  } catch (err) {
    // Server unreachable - render anyway so the welcome/error state shows.
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
      error: err instanceof Error ? err.message : String(err),
      authRequired: err instanceof ApiError && (err.status === 401 || err.status === 403),
    })
  }
}

/* --------------------------- version history write hook --------------------------- */

/**
 * `single` is an ordinary save; `bulk` is an operation that rewrites much of the configuration
 * at once (a backup import, a HABPanel import), which always deserves its own restore point.
 */
export type ConfigWriteKind = 'single' | 'bulk'

let beforeWrite: ((kind: ConfigWriteKind) => Promise<void>) | null = null

/**
 * Register something to run before every configuration write - the version history uses it to
 * capture the state a change is about to replace. Registered rather than imported so this store
 * stays a leaf: it must not depend on the history, which depends on it.
 */
export function onBeforeConfigWrite(fn: (kind: ConfigWriteKind) => Promise<void>): void {
  beforeWrite = fn
}

async function beforeConfigWrite(kind: ConfigWriteKind = 'single'): Promise<void> {
  if (beforeWrite) await beforeWrite(kind)
}

/**
 * Announce a rewrite made of many individual saves (the HABPanel importer), so the state it
 * replaces gets a restore point of its own rather than depending on when the last save happened.
 * The writes that follow are covered by that same point.
 */
export async function beginBulkConfigWrite(): Promise<void> {
  await beforeConfigWrite('bulk')
}

/**
 * Write a component, choosing create or update from what this tab believes is on the server.
 *
 * That belief can be out of date - another administrator's tab, or a restore from the version
 * history, adds and removes components behind this one's back - and openHAB answers a create for
 * an existing uid with a 500 and an update of a missing one with a 404. Rather than lose the
 * save, the other verb is tried before giving up; the first failure is what gets reported, since
 * the fallback's error would only describe the symptom.
 */
async function upsert<C>(component: UIComponent<C>): Promise<void> {
  // A component this build refused to read is one it must never write. Everything that saves
  // goes through here, so this is the one place that has to know it - and without it, opening
  // Settings on an older neohab and changing anything at all would overwrite a newer
  // configuration with this build's misreading of it.
  if (useConfigStore.getState().incompatible.some((c) => c.uid === component.uid)) {
    throw new Error(
      `${component.uid} was written by a newer version of neohab and will not be overwritten by this one.`
    )
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

/** Persist a dashboard to the server. Requires an admin token. */
export async function saveDashboard(dashboard: Dashboard): Promise<void> {
  await beforeConfigWrite()
  await upsert(dashboardComponent(dashboard))
  useConfigStore.setState((s) => {
    const others = s.dashboards.filter((d) => d.id !== dashboard.id)
    const dashboards = [...others, dashboard].sort(byName)
    return { dashboards }
  })
}

/** Delete a dashboard. Dashboards that never reached the server (demo) are removed locally. */
export async function deleteDashboard(id: string): Promise<void> {
  await beforeConfigWrite()
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
  // Applied locally first, and only then captured: settings drive controlled inputs, so waiting
  // for the restore point before updating the store would leave a switch sitting at its old
  // position until the round trip finished. The capture reads the server rather than the store,
  // so it still records the state this write is about to replace.
  const next = { ...useConfigStore.getState().settings, ...patch }
  useConfigStore.setState({ settings: next })
  await beforeConfigWrite()
  try {
    await upsert(settingsComponent(next))
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/** Upsert an arbitrary component into the neohab namespace (used by the importer). */
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
  await deleteComponent(THEME_PREFIX + id)
  useConfigStore.setState((s) => ({
    customThemes: s.customThemes.filter((t) => t.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== THEME_PREFIX + id)),
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
  await deleteComponent(WIDGETDEF_PREFIX + id)
  useConfigStore.setState((s) => ({
    widgetDefs: s.widgetDefs.filter((d) => d.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== WIDGETDEF_PREFIX + id)),
  }))
}

/** Persist a user-uploaded icon. Requires an admin token. */
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
  await deleteComponent(ICON_PREFIX + id)
  useConfigStore.setState((s) => ({
    customIcons: s.customIcons.filter((i) => i.id !== id),
    serverUids: new Set([...s.serverUids].filter((u) => u !== ICON_PREFIX + id)),
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

/**
 * Delete uploaded backgrounds nothing references anymore - a leftover from a replaced upload,
 * at hundreds of KB each, must not pile up in the config store. Failures are ignored: a missed
 * collection is retried by the next call, and viewing must never break over cleanup.
 *
 * "Referenced" means anywhere in the settings, in a dashboard (INCLUDING a widget's own config -
 * a floor plan's plan image is a background reference) or in a custom widget definition, plus
 * whatever the caller knows is about to be used, e.g. an unsaved editor draft. Deleting on
 * incomplete knowledge is how an image in use gets thrown away, so a store that never loaded
 * collects nothing at all.
 */
export async function collectUnusedBackgrounds(alsoKeep: (string | undefined)[] = []): Promise<void> {
  const s = useConfigStore.getState()
  if (!s.loaded) return
  // `incompatible` is in here deliberately: a dashboard from a newer neohab still references its
  // plan image, and not being able to READ a component is no reason at all to delete what it
  // points at. Same lesson as the widget-config references, one version later.
  const referenced = collectBackgroundRefs([s.settings, s.dashboards, s.widgetDefs, s.incompatible, alsoKeep])
  for (const bg of s.backgrounds) {
    if (referenced.has(bg.id)) continue
    try {
      await deleteComponent(BACKGROUND_PREFIX + bg.id)
      useConfigStore.setState((st) => ({
        backgrounds: st.backgrounds.filter((b) => b.id !== bg.id),
        serverUids: new Set([...st.serverUids].filter((u) => u !== BACKGROUND_PREFIX + bg.id)),
      }))
    } catch {
      /* not signed in or transient - the next collection gets it */
    }
  }
}

/* ------------------------------- backup / restore ------------------------------- */

export interface ExportBundle {
  manifest: {
    app: 'neohab'
    formatVersion: 1
    exportedAt: string
  }
  components: UIComponent[]
  /**
   * neohab's lighting presets (scenes and their bridge rules, `nh-scene-*` / `nh-bridge-*`).
   * Present - possibly empty - when the exporting device could read them (administrator);
   * absent when it could not. An import only manages the server's presets when the key is
   * present, so a viewer-made backup never wipes them.
   */
  scenes?: SceneRule[]
}

/** Build a full-configuration backup. Uses live server components when they exist. */
export async function buildExportBundle(includeBackgrounds = true): Promise<ExportBundle> {
  const s = useConfigStore.getState()
  let components: UIComponent[]
  if (s.serverUids.size > 0) {
    components = await listComponents()
  } else {
    // Nothing saved yet - export the current in-memory configuration.
    components = [
      settingsComponent(s.settings) as unknown as UIComponent,
      ...s.dashboards.map((d) => dashboardComponent(d)),
      ...s.customThemes.map((t) => themeComponent(t)),
      ...s.widgetDefs.map((d) => widgetDefComponent(d)),
      ...s.customIcons.map((i) => iconComponent(i)),
      ...s.backgrounds.map((b) => backgroundComponent(b)),
    ] as unknown as UIComponent[]
  }
  if (!includeBackgrounds) {
    components = components.filter((c) => !c.uid.startsWith(BACKGROUND_PREFIX))
  }
  // Readable file order: the human-editable components first, the base64 blobs (icons, then
  // the far bigger backgrounds) at the very end, so the file stays browsable in a text editor.
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
    components,
  }
  try {
    // Lighting presets live in the rule registry, not the component namespace. Reading them
    // whole needs an administrator; a viewer's backup simply carries no `scenes` key.
    const rules = await listRulesFull(NEOHAB_TAG)
    bundle.scenes = rules.filter((r) => r.editable !== false && isImportableSceneRule(r)).map(exportableRule)
  } catch {
    /* not an administrator (or no rules API) - the backup speaks only for components */
  }
  return bundle
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
  if (b.scenes !== undefined) {
    // Only neohab's own preset rules may ride in a backup - anything else here is a way to
    // overwrite arbitrary rules on the server, and is refused rather than filtered.
    if (!Array.isArray(b.scenes) || !b.scenes.every((r) => isImportableSceneRule(r))) {
      return 'Backup contains invalid presets'
    }
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
  await beforeConfigWrite('bulk')
  const existing = await listComponents()
  const have = new Set(existing.map((c) => c.uid))

  // Write the bundle in first, in both modes. Deleting up front would mean a failure partway
  // through (dropped connection, expired token) left the user with no configuration at all and
  // nothing to retry from; this way the worst case is a superset they can re-import over.
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

  // Presets, only when the backup speaks for them (see ExportBundle.scenes). Same write-first
  // order as the components: worst case after a failure is a superset. The verb is picked per
  // uid from a listing, so a normal import logs no fallback 404s.
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

/* --------------------------- partial export / import --------------------------- */

/**
 * All configuration components as they would be written: the live server list when there is one,
 * otherwise the in-memory configuration (a fresh install that has never saved). Shared by the
 * whole-configuration backup and the partial exports so both see the same thing.
 */
async function allComponents(): Promise<UIComponent[]> {
  const s = useConfigStore.getState()
  if (s.serverUids.size > 0) return listComponents()
  return [
    settingsComponent(s.settings) as unknown as UIComponent,
    ...s.dashboards.map((d) => dashboardComponent(d)),
    ...s.customThemes.map((t) => themeComponent(t)),
    ...s.widgetDefs.map((d) => widgetDefComponent(d)),
    ...s.customIcons.map((i) => iconComponent(i)),
    ...s.backgrounds.map((b) => backgroundComponent(b)),
  ] as unknown as UIComponent[]
}

export type PartialExport = { bundle: PartialBundle; missing: string[] }

/**
 * Build a one-widget-definition or one-theme export, with everything it references.
 * Returns null when the component isn't there anymore.
 */
export async function buildComponentExport(kind: 'widgetdef' | 'theme', id: string): Promise<PartialExport | null> {
  return buildPartialBundle(kind, id, await allComponents(), new Date().toISOString())
}

/**
 * Build a one-dashboard export. The dashboard is passed in rather than looked up so the editor
 * can export the draft it is showing - exporting a dashboard while it has unsaved changes must
 * produce the dashboard on screen, not the last saved version. Dependencies are still resolved
 * against the stored configuration, since that is where widget definitions and icons live.
 */
export async function buildDashboardExport(dashboard: Dashboard): Promise<PartialExport | null> {
  const uid = DASHBOARD_PREFIX + dashboard.id
  const rest = (await allComponents()).filter((c) => c.uid !== uid)
  const components = [dashboardComponent(dashboard) as unknown as UIComponent, ...rest]
  return buildPartialBundle('dashboard', dashboard.id, components, new Date().toISOString())
}

/**
 * What a partial import would do, against what is actually stored (not this tab's cached idea
 * of it): which incoming components are new, unchanged, or would collide.
 */
export async function planPartialImportOnServer(bundle: PartialBundle): Promise<PartialPlan> {
  return planPartialImport(bundle, await listComponents())
}

export interface PartialImportResult {
  primaryUid: string
  renamed: [string, string][]
  reused: string[]
  written: number
}

/**
 * Import a partial export. `copy` never touches an existing component (colliding ones are
 * written under a free id with every reference rewritten); `overwrite` replaces them.
 *
 * One restore point covers the whole import ('bulk'), like the other multi-component writes.
 */
export async function importPartialBundle(
  bundle: PartialBundle,
  mode: PartialImportMode
): Promise<PartialImportResult> {
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
    written: resolved.components.length,
  }
}
