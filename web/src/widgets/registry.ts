import type { Route } from '../app/router'
import type { ItemControl } from './common/itemControl'
import type { WidgetDefinition } from './types'

type AnyWidgetDefinition = WidgetDefinition<Record<string, unknown>>

const registry = new Map<string, AnyWidgetDefinition>()

export function registerWidget<C>(def: WidgetDefinition<C>): void {
  if (registry.has(def.type)) {
    console.warn(`Widget type "${def.type}" is already registered; overwriting.`)
  }
  registry.set(def.type, def as unknown as AnyWidgetDefinition)
}

export function getWidgetDefinition(type: string): AnyWidgetDefinition | undefined {
  return registry.get(type)
}

export function listWidgetDefinitions(): AnyWidgetDefinition[] {
  return [...registry.values()]
}

function effective(def: AnyWidgetDefinition, config: Record<string, unknown>): Record<string, unknown> {
  return { ...def.defaultConfig(), ...config }
}

export function itemsForInstance(type: string, config: Record<string, unknown>): string[] {
  const def = registry.get(type)
  if (!def?.itemKeys) return []
  return def.itemKeys(effective(def, config)).filter((v): v is string => typeof v === 'string' && v.length > 0)
}

export function instanceMinHeight(type: string, config: Record<string, unknown>): number {
  const def = registry.get(type)
  if (!def) return 0
  const min = def.minPixelHeight
  const v = typeof min === 'function' ? min(effective(def, config)) : min
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

export function instanceFixedShape(type: string): boolean {
  return registry.get(type)?.fixedShape === true
}

// one rule for "does this instance draw a title bar": the panel offers the name settings off it, and
// WidgetHost honours labelMode: 'none' off it
export function hasHeaderFor(def: AnyWidgetDefinition | undefined, config: Record<string, unknown>): boolean {
  if (!def) return false
  return typeof def.hasHeader === 'function' ? def.hasHeader(config) === true : def.hasHeader === true
}

export function instanceHasHeader(type: string, config: Record<string, unknown>): boolean {
  const def = registry.get(type)
  return def ? hasHeaderFor(def, effective(def, config)) : false
}

export function widgetDetailView(type: string): AnyWidgetDefinition['DetailView'] {
  return registry.get(type)?.DetailView
}

export function instanceDetailRoute(type: string, dashboardId: string, widgetId: string): Route | undefined {
  return registry.get(type)?.detailRoute?.(dashboardId, widgetId)
}

export function instanceHasDetail(type: string, config: Record<string, unknown>): boolean {
  const def = registry.get(type)
  return def?.DetailView !== undefined || def?.detailRoute !== undefined || itemsForInstance(type, config).length > 0
}

export function instanceCommands(type: string, config: Record<string, unknown>): boolean {
  const def = registry.get(type)
  return def ? def.canCommand?.(effective(def, config)) === true : false
}

export function instanceControl(type: string, config: Record<string, unknown>, item: string): ItemControl | undefined {
  const def = registry.get(type)
  if (!def) return undefined
  return def.controlFor ? def.controlFor(effective(def, config), item) : { kind: 'auto' }
}
