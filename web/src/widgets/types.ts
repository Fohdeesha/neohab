/**
 * The widget contract.
 *
 * Every widget is a self-contained module exporting one {@link WidgetDefinition}. Adding or
 * revising a widget means editing a single folder: its component, its default config, and its
 * settings schema. The runtime hands every widget the same {@link WidgetProps}, so a widget's
 * internals can change freely without touching the grid, the store, or other widgets.
 */
import type { ComponentType } from 'react'
import type { ItemState } from '../api/types'

/** Runtime context passed to every widget. Uniform on purpose - the stable contract. */
export interface WidgetContext {
  /** Live state of an item by name, or undefined if unknown/not yet received. */
  getItem: (name: string) => ItemState | undefined
  /** Send a command to an item. */
  sendCommand: (item: string, command: string) => void
  /** True while the dashboard is in edit mode (widgets should suppress interactions). */
  editing: boolean
}

export interface WidgetProps<C = Record<string, unknown>> {
  config: C
  ctx: WidgetContext
}

/**
 * A single field in a widget's settings form. The editor (Phase 3) renders these generically;
 * defining them now keeps each widget's configurable surface declarative and self-documenting.
 */
export type SettingField =
  | { key: string; type: 'item'; label: string; itemTypes?: string[] }
  | { key: string; type: 'icon'; label: string }
  | { key: string; type: 'text'; label: string; placeholder?: string }
  | { key: string; type: 'multiline'; label: string; placeholder?: string }
  | { key: string; type: 'number'; label: string; min?: number; max?: number; step?: number }
  | { key: string; type: 'boolean'; label: string }
  | { key: string; type: 'color'; label: string }
  | { key: string; type: 'select'; label: string; options: { value: string; label: string }[] }

export interface WidgetDefinition<C = Record<string, unknown>> {
  /** Registry key, also stored as `WidgetInstance.type`. Stable - do not rename casually. */
  type: string
  /** Human-facing name shown in the widget palette. */
  name: string
  /** Short description for the palette. */
  description: string
  /** Default grid size when first placed (grid cells). */
  defaultSize: { w: number; h: number }
  /**
   * Smallest pixel height at which the widget is fully usable. The mobile stacked view uses
   * it as a floor so short grid cells never clip controls on phones.
   */
  minPixelHeight?: number
  /** Factory for a fresh instance config. */
  defaultConfig: () => C
  /** Declarative settings schema for the editor. */
  settings: SettingField[]
  /** The React component rendering the widget. */
  Component: ComponentType<WidgetProps<C>>
  /** Item-name config keys whose live state this widget needs tracked via SSE. */
  itemKeys?: (config: C) => string[]
}
