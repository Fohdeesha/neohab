export interface WidgetDefSetting {
  id: string
  type?: string
  label?: string
  description?: string
  default?: unknown
}

export interface CustomWidgetDef {
  version: number
  id: string
  name: string
  kind?: 'template' | 'js'
  template?: string
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

export function mergedSettingValues(def: CustomWidgetDef, instanceValues: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of defSettings(def)) {
    const raw = instanceValues?.[s.id] !== undefined ? instanceValues[s.id] : s.default
    const v = coerceSettingValue(s, raw)
    if (v !== undefined) out[s.id] = v
  }
  // own keys only: `k in out` would see Object.prototype and drop a setting named "toString"
  for (const [k, v] of Object.entries(instanceValues ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = v
  }
  return out
}
