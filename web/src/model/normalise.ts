import type { ComponentKind } from './schema'

/**
 * Stored configuration is untrusted input: a backup, a shared file or a hand edit is written to the
 * server verbatim, and every screen reads it. Repairing the SHAPE once, where it is loaded, beats a
 * guard at every read - the readers that forgot one took down Home, the sidebar and Settings.
 * This fixes shape only (a list that is not a list, a field of the wrong type); values keep their
 * own guards where they are used, because only the reader knows its range.
 */

type Obj = Record<string, unknown>

const plain = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v)

export const idOfUid = (uid: string): string => uid.slice(uid.indexOf(':') + 1)

function stringOrDrop(config: Obj, key: string): void {
  if (config[key] !== undefined && typeof config[key] !== 'string') delete config[key]
}

function booleanOrDrop(config: Obj, key: string): void {
  if (config[key] !== undefined && typeof config[key] !== 'boolean') delete config[key]
}

// a null row in a stored list crashed every editor that listed it; nothing in a list means null
function withoutNullRows(value: unknown, depth = 0): unknown {
  if (depth > 8) return value
  if (Array.isArray(value)) return value.filter((v) => v !== null && v !== undefined).map((v) => withoutNullRows(v, depth + 1))
  // fromEntries defines each key, so a stored `__proto__` stays a key instead of hitting the setter
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withoutNullRows(v, depth + 1)]))
  return value
}

/** a widget's own config in the shape the editors read, for anything that arrives without passing a load */
export function normaliseWidgetConfig(config: unknown): Obj {
  return plain(config) ? (withoutNullRows(config) as Obj) : {}
}

function normaliseWidgets(list: unknown): Obj[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: Obj[] = []
  list.forEach((entry, i) => {
    if (!plain(entry)) return
    let id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : `w-${i}`
    // two widgets sharing an id would be edited, moved and deleted as one
    for (let n = 2; seen.has(id); n++) id = `${id}-${n}`
    seen.add(id)
    const layout: Obj = {}
    if (plain(entry.layout)) {
      for (const bp of ['lg', 'md']) if (plain(entry.layout[bp])) layout[bp] = entry.layout[bp]
    }
    out.push({
      ...entry,
      id,
      type: typeof entry.type === 'string' ? entry.type : '',
      config: normaliseWidgetConfig(entry.config),
      layout
    })
  })
  return out
}

function normaliseDashboard(config: Obj): void {
  config.widgets = normaliseWidgets(config.widgets)
  if (config.stackOrder !== undefined) {
    if (Array.isArray(config.stackOrder)) config.stackOrder = config.stackOrder.filter((s) => typeof s === 'string')
    else delete config.stackOrder
  }
  stringOrDrop(config, 'icon')
  stringOrDrop(config, 'background')
  booleanOrDrop(config, 'hideInSidebar')
}

function normaliseTheme(config: Obj): void {
  config.tokens = plain(config.tokens) ? Object.fromEntries(Object.entries(config.tokens).filter(([, v]) => typeof v === 'string')) : {}
  if (config.scheme !== 'dark' && config.scheme !== 'light') config.scheme = 'dark'
  stringOrDrop(config, 'css')
  stringOrDrop(config, 'cssModule')
}

function normaliseWidgetDef(config: Obj): void {
  stringOrDrop(config, 'template')
  stringOrDrop(config, 'script')
  stringOrDrop(config, 'source')
  if (config.kind !== undefined && config.kind !== 'template' && config.kind !== 'js') delete config.kind
  if (config.settings !== undefined) {
    if (Array.isArray(config.settings)) config.settings = config.settings.filter((s) => plain(s) && typeof s.id === 'string')
    else delete config.settings
  }
  if (config.habpanel !== undefined && !plain(config.habpanel)) delete config.habpanel
}

function normaliseSettings(config: Obj): void {
  for (const key of ['theme', 'background', 'controlItem', 'speechItem']) stringOrDrop(config, key)
  for (const key of ['allowJsWidgets', 'sidebar', 'voiceButton', 'liveDrag']) booleanOrDrop(config, key)
}

/** The stored config of one component, in the shape the app reads. Never mutates its argument. */
export function normaliseConfig(kind: ComponentKind, uid: string, stored: unknown): Obj {
  const config: Obj = plain(stored) ? { ...stored } : {}
  if (kind === 'settings') {
    normaliseSettings(config)
    return config
  }
  // the uid is the storage key, so it is the one that is right: a file carrying `config.id` for some
  // other component would otherwise be saved over it, and deleted with it
  config.id = idOfUid(uid)
  if (config.name !== undefined && typeof config.name !== 'string') config.name = String(config.name)
  if (kind === 'dashboard') normaliseDashboard(config)
  else if (kind === 'theme') normaliseTheme(config)
  else if (kind === 'widgetdef') normaliseWidgetDef(config)
  else stringOrDrop(config, 'dataUri')
  return config
}
