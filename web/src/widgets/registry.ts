import type { ItemControl } from './common/itemControl'
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

/**
 * A widget's definition defaults under its stored keys: the config the tile actually renders from
 * (`WidgetHost` builds the same one) and the settings panel edits.
 *
 * Every reader below resolves it here rather than trusting what it was handed, because its callers
 * disagree - the grids pass the stored config and the detail sheet passes a merged one. That was
 * harmless while no default decided anything; the colour picker's buttons default to on, so a raw
 * read would put them in the sheet and not in the row height beneath it. Cheap: every
 * `defaultConfig` is an object literal.
 */
function effective(def: AnyWidgetDefinition, config: Record<string, unknown>): Record<string, unknown> {
  return { ...def.defaultConfig(), ...config }
}

/** Collect every item name a widget instance needs tracked, using its definition's itemKeys. */
export function itemsForInstance(type: string, config: Record<string, unknown>): string[] {
  const def = registry.get(type)
  if (!def?.itemKeys) return []
  return def.itemKeys(effective(def, config)).filter((v): v is string => typeof v === 'string' && v.length > 0)
}

/**
 * The floor this instance needs in the stacked view. See `WidgetDefinition.minPixelHeight`: a
 * widget may answer from its own config, and an unregistered type asks for nothing.
 */
export function instanceMinHeight(type: string, config: Record<string, unknown>): number {
  const def = registry.get(type)
  if (!def) return 0
  const min = def.minPixelHeight
  const v = typeof min === 'function' ? min(effective(def, config)) : min
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * The widget's own detail view, when it has one. See `WidgetDefinition.DetailView`: a widget
 * that declares one answers the hold gesture with it instead of the item flow.
 */
export function widgetDetailView(type: string): AnyWidgetDefinition['DetailView'] {
  return registry.get(type)?.DetailView
}

/**
 * Is there anything to show when this instance is held? Either an item to open, or a view the
 * widget draws itself. A widget with neither keeps the browser's own context menu rather than
 * offering a gesture that opens an empty sheet.
 */
export function instanceHasDetail(type: string, config: Record<string, unknown>): boolean {
  return widgetDetailView(type) !== undefined || itemsForInstance(type, config).length > 0
}

/**
 * Does this instance command its items, or only show them? See `WidgetDefinition.canCommand`.
 * An unregistered type answers no, which is the same safe direction as omitting the declaration.
 */
export function instanceCommands(type: string, config: Record<string, unknown>): boolean {
  const def = registry.get(type)
  return def ? def.canCommand?.(effective(def, config)) === true : false
}

/**
 * Which control this instance offers for one of its items. See `WidgetDefinition.controlFor`:
 * `undefined` means this widget does not command that item, and `{ kind: 'auto' }` asks for the
 * state-shape rule. A registered widget that declares nothing gets `auto`, which is what every
 * widget got before any of them could answer; an unregistered type commands nothing at all.
 */
export function instanceControl(
  type: string,
  config: Record<string, unknown>,
  item: string
): ItemControl | undefined {
  const def = registry.get(type)
  if (!def) return undefined
  return def.controlFor ? def.controlFor(effective(def, config), item) : { kind: 'auto' }
}
