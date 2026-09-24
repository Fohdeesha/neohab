import { emptyMap, lookup } from './lookup'

export interface WidgetDefSetting {
  id: string
  type?: string
  label?: string
  description?: string
  default?: unknown
  // comma separated, as HABPanel writes it
  choices?: unknown
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

/** HABPanel's names for two of these; a definition imported from it keeps its own */
export function settingKind(setting: WidgetDefSetting): string {
  if (setting.type === 'checkbox') return 'boolean'
  if (setting.type === 'choice') return 'choices'
  return typeof setting.type === 'string' ? setting.type : 'string'
}

export function settingChoices(setting: WidgetDefSetting): string[] {
  const raw = setting.choices
  const list = typeof raw === 'string' ? raw.split(',') : Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string') : []
  return [...new Set(list.map((c) => c.trim()).filter((c) => c !== ''))]
}

export function coerceSettingValue(setting: WidgetDefSetting, value: unknown): unknown {
  if (value === undefined || value === null) return value
  switch (settingKind(setting)) {
    case 'number': {
      const n = Number(value)
      return Number.isFinite(n) ? n : value
    }
    // a checkbox once went through a text box and was stored as "false", which a template reads as true
    case 'boolean':
      return value === true || value === 'true'
    default:
      return value
  }
}

export function mergedSettingValues(def: CustomWidgetDef, instanceValues: Record<string, unknown> | undefined): Record<string, unknown> {
  // setting ids come from a stored widget definition, so one called __proto__ or constructor is
  // possible: written onto a plain {} it would vanish, and read back it would answer with a function
  const out: Record<string, unknown> = emptyMap()
  for (const s of defSettings(def)) {
    const stored = instanceValues ? lookup(instanceValues, s.id) : undefined
    const raw = stored !== undefined ? stored : s.default
    const v = coerceSettingValue(s, raw)
    if (v !== undefined) out[s.id] = v
  }
  // own keys only: `k in out` would see Object.prototype and drop a setting named "toString"
  for (const [k, v] of Object.entries(instanceValues ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = v
  }
  return out
}
