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
import type { ItemControl } from './common/itemControl'

/** Runtime context passed to every widget. Uniform on purpose - the stable contract. */
export interface WidgetContext {
  /**
   * Id of this widget instance. Stable across mode switches (run/edit remount the tree), so
   * widgets can key ephemeral UI state on it and survive the remount.
   */
  widgetId: string
  /** Live state of an item by name, or undefined if unknown/not yet received. */
  getItem: (name: string) => ItemState | undefined
  /**
   * Send a command to an item. Never rejects (failures are reported to the user centrally);
   * resolves true when the server accepted it, so widgets showing an optimistic value can drop
   * it when the device never took the command.
   */
  sendCommand: (item: string, command: string) => Promise<boolean>
  /** True while the dashboard is in edit mode (widgets should suppress interactions). */
  editing: boolean
}

export interface WidgetProps<C = Record<string, unknown>> {
  config: C
  ctx: WidgetContext
}

/** Shared by every field kind. */
interface SettingCommon {
  /**
   * Render this field only when the predicate accepts the widget's effective config (stored
   * values over definition defaults). Use it to hide settings another setting has made
   * irrelevant, so the form only ever offers fields that do something.
   */
  showIf?: (config: Record<string, unknown>) => boolean
  /** Explanatory line under the field, for settings whose consequences aren't self-evident. */
  hint?: string
}

/**
 * A single field in a widget's settings form. The editor renders these generically, so a widget's
 * configurable surface is declarative data rather than a form someone has to write.
 */
export type SettingField = SettingCommon &
  (
    | { key: string; type: 'item'; label: string; itemTypes?: string[] }
    | { key: string; type: 'icon'; label: string }
    | { key: string; type: 'text'; label: string; placeholder?: string }
    | { key: string; type: 'multiline'; label: string; placeholder?: string }
    | { key: string; type: 'number'; label: string; min?: number; max?: number; step?: number }
    | { key: string; type: 'boolean'; label: string }
    | { key: string; type: 'color'; label: string }
    | { key: string; type: 'select'; label: string; options: { value: string; label: string }[] }
    /**
     * Any number of the options, stored as a string list. `defaultValue` is what the widget does
     * when the key is absent, so the form can show that set as selected instead of an empty row
     * that contradicts what the widget is drawing. The first toggle stores a real list, and the
     * author owns it from then on.
     */
    | {
        key: string
        type: 'multiselect'
        label: string
        options: { value: string; label: string }[]
        defaultValue?: string[]
      }
    /** Pick one of the existing dashboards (stores its id). */
    | { key: string; type: 'dashboard'; label: string }
    /** Which screen sizes this widget is hidden on (phone / tablet / desktop). */
    | { key: string; type: 'hideon'; label: string }
    /** Background-image style value: a URL or an uploaded `bg:<id>` reference. */
    | { key: string; type: 'planimage'; label: string }
    /** A place for the weather widget: geocoding search plus manual coordinates. */
    | { key: string; type: 'weatherlocation'; label: string }
    /** An item-name pattern with `{n}` for the slot number, previewed against the catalog. */
    | { key: string; type: 'itempattern'; label: string; placeholder?: string }
    /** The floor plan's lights - a button opening the place-on-the-plan editor sheet. */
    | { key: string; type: 'planlights'; label: string }
    /* list editors rendered by dedicated components in editor/ */
    | { key: string; type: 'camerastream'; label: string }
    | { key: string; type: 'stateicons'; label: string }
    | { key: string; type: 'chartseries'; label: string }
    | { key: string; type: 'chartthresholds'; label: string }
    | { key: string; type: 'statecolors'; label: string }
    | { key: string; type: 'timelineseries'; label: string }
    | { key: string; type: 'gaugeseverity'; label: string }
    | { key: string; type: 'gaugemarkers'; label: string }
    | { key: string; type: 'gaugezones'; label: string }
  )

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
  /**
   * True when the widget shows its Name as the shared frame's header row. Header widgets get
   * the universal "Show the name" / "Name alignment" / "Name position" settings; widgets whose
   * label is content (button) or who have no name at all (clock, label) must not offer fields
   * that do nothing.
   */
  hasHeader?: boolean
  /**
   * Extra "Show the name" choices beyond the universal "In the title bar" / "Not at all" - the
   * camera's "Over the picture" is the only one so far. They sit between the two universal
   * choices, and the widget itself decides what its own value draws; `labelMode: 'none'` is
   * honoured centrally (WidgetHost drops the name from the config it hands the widget).
   */
  labelModes?: { options: { value: string; label: string }[]; hint?: string }
  /** Factory for a fresh instance config. */
  defaultConfig: () => C
  /** Declarative settings schema for the editor. */
  settings: SettingField[]
  /** The React component rendering the widget. */
  Component: ComponentType<WidgetProps<C>>
  /** Item-name config keys whose live state this widget needs tracked via SSE. */
  itemKeys?: (config: C) => string[]
  /**
   * Whether THIS instance commands the items it binds, rather than only displaying them.
   *
   * It is what the detail sheet asks before offering a control: a read-only gauge is a display
   * its author deliberately made uncommandable, and holding one to be handed a slider is exactly
   * the surprise this answers. The item's own `stateDescription.readOnly` is the other half, and
   * both have to agree before a control is drawn.
   *
   * Omitted means NO - the safe direction, since the cost of forgetting it is a control that is
   * missing (visible, one line to add) rather than a command nobody asked for. Every widget that
   * declares `itemKeys` must say either way; a unit check over the registry enforces it.
   */
  canCommand?: (config: C) => boolean
  /**
   * WHICH control the detail sheet should offer for one of this widget's items, given this
   * instance's configuration.
   *
   * The sheet used to guess it from the item's state, which threw away everything the author had
   * set: a slider configured 2000-6500 K was handed a 0-100 track, a rollershutter got a position
   * slider instead of up/stop/down, and a media player got nothing at all. A widget knows what it
   * is; this is where it says so.
   *
   * Answering `undefined` means THIS item is not one this widget commands - a gauge's marker
   * follows an item it never writes to - so no control is drawn for it. `{ kind: 'auto' }` asks
   * for the old state-shape rule, which is the honest answer where a widget really cannot know
   * (a floor plan's lights are whatever the house has). Every widget that declares `canCommand`
   * must declare this too; a unit check over the registry enforces it.
   */
  controlFor?: (config: C, item: string) => ItemControl | undefined
}
