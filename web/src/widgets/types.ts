import type { ComponentType } from 'react'
import type { ItemState } from '../api/types'
import type { Route } from '../app/router'
import type { ItemControl } from './common/itemControl'

export interface WidgetContext {
  widgetId: string
  getItem: (name: string) => ItemState | undefined
  sendCommand: (item: string, command: string) => Promise<boolean>
  editing: boolean
  // the stacked surface derives the cell's height rather than taking one the author drew, so a
  // widget may fit its own parts into it. On a tile somebody sized by hand, it may not.
  stacked?: boolean
}

export interface WidgetProps<C = Record<string, unknown>> {
  config: C
  ctx: WidgetContext
}

interface SettingCommon {
  showIf?: (config: Record<string, unknown>) => boolean
  hint?: string
}

export type SettingField = SettingCommon &
  // not a value: it starts a named group, and everything after it belongs to that group until the
  // next one. What comes BEFORE the first marker is the widget's essentials, shown with no heading
  // and never folded away.
  (
    | { key: string; type: 'section'; label: string }
    // optional: the widget still does its job with this one empty, so WidgetHost must not replace it
    // with "no item yet". A navigate button is the case: it goes somewhere whether or not it also
    // follows an item's state.
    | {
        key: string
        type: 'item'
        label: string
        itemTypes?: string[]
        readOnly?: boolean
        optional?: (config: Record<string, unknown>) => boolean
      }
    | { key: string; type: 'icon'; label: string }
    | { key: string; type: 'text'; label: string; placeholder?: string; subresource?: boolean }
    | { key: string; type: 'multiline'; label: string; placeholder?: string }
    | { key: string; type: 'number'; label: string; min?: number; max?: number; step?: number }
    | { key: string; type: 'boolean'; label: string }
    | { key: string; type: 'color'; label: string }
    | { key: string; type: 'select'; label: string; options: { value: string; label: string; group?: string }[] }
    | {
        key: string
        type: 'multiselect'
        label: string
        options: { value: string; label: string }[]
        defaultValue?: string[]
      }
    | { key: string; type: 'dashboard'; label: string }
    | { key: string; type: 'hideon'; label: string }
    | { key: string; type: 'planimage'; label: string }
    | { key: string; type: 'weatherlocation'; label: string }
    | { key: string; type: 'itempattern'; label: string; placeholder?: string }
    | { key: string; type: 'planlights'; label: string }
    | { key: string; type: 'clockzones'; label: string }
    | { key: string; type: 'timezone'; label: string }
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
  type: string
  name: string
  description: string
  defaultSize: { w: number; h: number }
  minPixelHeight?: number | ((config: C) => number)
  // draws something with a shape of its own (a plan image), so the stacked surface keeps the
  // proportion the author gave the tile instead of its row count - see stackedCellHeight
  fixedShape?: boolean
  hasHeader?: boolean | ((config: C) => boolean)
  labelModes?: { options: { value: string; label: string }[]; hint?: string }
  defaultConfig: () => C
  settings: SettingField[]
  Component: ComponentType<WidgetProps<C>>
  DetailView?: ComponentType<WidgetProps<C>>
  detailRoute?: (dashboardId: string, widgetId: string) => Route
  itemKeys?: (config: C) => string[]
  canCommand?: (config: C) => boolean
  controlFor?: (config: C, item: string) => ItemControl | undefined
}
