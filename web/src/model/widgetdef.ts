/**
 * Custom widget definitions (config namespace `widgetdef:<id>`).
 *
 * Two shapes coexist: definitions created in neohab store `template`/`settings` natively;
 * definitions imported from HABPanel keep the original under `habpanel` untouched. The
 * accessors below normalize both so the engine and the manager UI don't care.
 */

export interface WidgetDefSetting {
  id: string
  /** HABPanel setting types: string | number | boolean | item | choices | color | icon | heading */
  type?: string
  label?: string
  description?: string
  default?: unknown
}

export interface CustomWidgetDef {
  version: number
  id: string
  name: string
  /** 'template' (default) renders sanitized declarative HTML; 'js' is the sandboxed tier. */
  kind?: 'template' | 'js'
  template?: string
  /** Tier-2 only: JavaScript source run inside a sandboxed iframe. */
  script?: string
  settings?: WidgetDefSetting[]
  source?: string
  habpanel?: {
    name?: string
    template?: string
    settings?: WidgetDefSetting[]
    readme_url?: string
  }
}

export function defTemplate(def: CustomWidgetDef): string {
  return def.template ?? def.habpanel?.template ?? ''
}

export function defSettings(def: CustomWidgetDef): WidgetDefSetting[] {
  const list = def.settings ?? def.habpanel?.settings
  return Array.isArray(list) ? list.filter((s) => s && typeof s.id === 'string') : []
}

/** Coerce a stored/default setting value by its declared type (HABPanel stores numbers as strings). */
export function coerceSettingValue(setting: WidgetDefSetting, value: unknown): unknown {
  if (value === undefined || value === null) return value
  switch (setting.type) {
    case 'number': {
      const n = Number(value)
      return Number.isFinite(n) ? n : value
    }
    case 'boolean':
      return value === true || value === 'true'
    default:
      return value
  }
}

/** Instance settings merged over definition defaults, all coerced. */
export function mergedSettingValues(
  def: CustomWidgetDef,
  instanceValues: Record<string, unknown> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of defSettings(def)) {
    const raw = instanceValues?.[s.id] !== undefined ? instanceValues[s.id] : s.default
    const v = coerceSettingValue(s, raw)
    if (v !== undefined) out[s.id] = v
  }
  // keep any extra instance keys the schema doesn't declare (own keys only: `k in out` would
  // see Object.prototype and drop a setting named "toString")
  for (const [k, v] of Object.entries(instanceValues ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = v
  }
  return out
}
