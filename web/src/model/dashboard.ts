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
  /** Icon shown on the Home tile and in the sidebar (any `Icon` reference). */
  icon?: string
  /** Keep this dashboard out of the sidebar list (HABPanel's `drawer.hide`). */
  hideInSidebar?: boolean
  /**
   * Background image for this dashboard, overriding the global one from settings.
   * A URL, or `bg:<id>` referencing an uploaded `background:<id>` component.
   */
  background?: string
  /** Grid columns at the `lg` breakpoint (narrower breakpoints scale down). */
  columns: number
  /**
   * Grid row height in pixels, or 'match' for square cells (row height = column width,
   * HABPanel's default) so dashboards keep their proportions at any viewport width.
   */
  rowHeight: number | 'match'
  /** Gap between grid cells in pixels (default 8). */
  gap?: number
  /**
   * Text size for the whole dashboard, percent (100 = normal). Multiplies the automatic
   * text scaling on every surface, so proportions and phone behavior are preserved.
   * HABPanel's `font_scale` imports into this.
   */
  textSize?: number
  /**
   * Columns for the tablet layout (see MD_BELOW). Absent = the same count as `columns`.
   * Only meaningful once a tablet layout exists at all (`hasTabletLayout`).
   */
  mdColumns?: number
  /**
   * Explicit widget order for the single-column (phone) stack, set the first time the user
   * reorders it. Absent = derived from the grid layout (row by row). Widgets missing from the
   * list (added later) stack after the listed ones; stale ids are ignored.
   */
  stackOrder?: string[]
  widgets: WidgetInstance[]
}

/**
 * Fresh, collision-unlikely widget instance id. Ids double as keys for per-instance UI state
 * (a chart's picked period), so anything creating widgets - the editor, a paste, an imported
 * copy of a dashboard - mints them here.
 */
export function newWidgetId(): string {
  return 'w-' + Math.random().toString(36).slice(2, 10)
}

export function createDashboard(id: string, name: string): Dashboard {
  return { version: MODEL_VERSION, id, name, columns: 12, rowHeight: 'match', widgets: [] }
}

/** URL-safe dashboard id derived from a display name, de-duped against existing ids. */
export function slugifyDashboardId(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'dashboard'
  if (!existing.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!existing.has(candidate)) return candidate
  }
}
