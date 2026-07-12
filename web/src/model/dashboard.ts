/**
 * neohab's own dashboard/widget data model.
 *
 * This schema is deliberately independent of any grid or rendering library so widgets and the
 * layout engine can be revised without a data migration. Layout is stored per breakpoint as
 * simple grid rectangles; the runtime and (later) the editor both operate on this shape.
 */

export const MODEL_VERSION = 1

/** Responsive breakpoints, widest first. Column counts are defined per dashboard. */
export type Breakpoint = 'lg' | 'md' | 'sm' | 'xs'
export const BREAKPOINTS: Breakpoint[] = ['lg', 'md', 'sm', 'xs']

/** A widget's placement on the grid at one breakpoint (units = grid cells). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Per-breakpoint layout. `lg` is authored directly; narrower ones may be auto-derived. */
export type WidgetLayout = Partial<Record<Breakpoint, Rect>>

/** A widget instance placed on a dashboard. `config` is widget-type specific. */
export interface WidgetInstance<C = Record<string, unknown>> {
  id: string
  type: string
  config: C
  layout: WidgetLayout
}

export interface Dashboard {
  version: number
  id: string
  name: string
  /** Grid columns at the `lg` breakpoint (narrower breakpoints scale down). */
  columns: number
  /**
   * Grid row height in pixels, or 'match' for square cells (row height = column width,
   * HABPanel's default) so dashboards keep their proportions at any viewport width.
   */
  rowHeight: number | 'match'
  /** Gap between grid cells in pixels (default 8). */
  gap?: number
  widgets: WidgetInstance[]
}

export function createDashboard(id: string, name: string): Dashboard {
  return { version: MODEL_VERSION, id, name, columns: 12, rowHeight: 40, widgets: [] }
}
