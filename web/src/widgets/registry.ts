import type { WidgetDefinition } from './types'

/**
 * The widget registry.
 *
 * Definitions are generic in their own config type, but the registry holds them all together, so
 * what goes in is narrowed to the erased shape on the way. The cast is the one place that happens:
 * everything downstream reads a `WidgetDefinition<Record<string, unknown>>`, and `WidgetHost` hands
 * each component the config its own definition described.
 */
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

/** Collect every item name a widget instance needs tracked, using its definition's itemKeys. */
export function itemsForInstance(type: string, config: Record<string, unknown>): string[] {
  const def = registry.get(type)
  if (!def?.itemKeys) return []
  return def.itemKeys(config).filter((v): v is string => typeof v === 'string' && v.length > 0)
}
