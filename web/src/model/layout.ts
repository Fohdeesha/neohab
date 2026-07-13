/** Pure grid-layout math shared by the runtime grid and the editor. */
import type { Dashboard, Rect, WidgetInstance } from './dashboard'

export function rectOf(widget: WidgetInstance): Rect {
  return widget.layout.lg ?? { x: 0, y: 0, w: 3, h: 3 }
}

export const DEFAULT_GAP = 8

/** Below this container width the dashboard renders as a single-column stack. */
export const STACK_BELOW = 720 // px
/** Assumed desktop width when computing stacked heights for 'match' dashboards. */
export const STACK_REFERENCE_WIDTH = 1280

/**
 * Widgets in single-column (stacked) display order: the dashboard's explicit stackOrder when
 * present, otherwise derived from the grid layout by row then column. Widgets not in the
 * explicit list keep their derived order after the listed ones.
 */
export function stackedOrder(dashboard: Dashboard): WidgetInstance[] {
  const derived = [...dashboard.widgets].sort((a, b) => {
    const ra = rectOf(a)
    const rb = rectOf(b)
    return ra.y - rb.y || ra.x - rb.x
  })
  const order = dashboard.stackOrder
  if (!order || order.length === 0) return derived
  const pos = new Map(order.map((id, i) => [id, i]))
  return derived.sort((a, b) => {
    const pa = pos.get(a.id)
    const pb = pos.get(b.id)
    if (pa !== undefined && pb !== undefined) return pa - pb
    if (pa !== undefined) return -1
    if (pb !== undefined) return 1
    return 0 // both unlisted: stable sort keeps derived order
  })
}

/**
 * Pixel geometry of one grid cell at a given container width. With rowHeight 'match' the
 * cells are square (row height = column width), so dashboards scale proportionally.
 */
export function cellMetrics(
  dashboard: Dashboard,
  containerWidth: number
): { gap: number; colWidth: number; rowHeight: number } {
  const gap = dashboard.gap ?? DEFAULT_GAP
  const colWidth = (containerWidth - gap * (dashboard.columns - 1)) / dashboard.columns
  const rowHeight = dashboard.rowHeight === 'match' ? Math.max(8, colWidth) : dashboard.rowHeight
  return { gap, colWidth, rowHeight }
}

export function collides(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Clamp a rect into the grid: at least 1x1, within columns horizontally, y >= 0. */
export function clampRect(rect: Rect, columns: number): Rect {
  const w = Math.max(1, Math.min(rect.w, columns))
  const h = Math.max(1, rect.h)
  const x = Math.max(0, Math.min(rect.x, columns - w))
  const y = Math.max(0, rect.y)
  return { x, y, w, h }
}

/** True if `rect` overlaps any widget other than `ignoreId`. */
export function overlapsAny(dashboard: Dashboard, rect: Rect, ignoreId?: string): boolean {
  return dashboard.widgets.some((w) => w.id !== ignoreId && collides(rect, rectOf(w)))
}

/** Find the topmost-leftmost free w x h spot, scanning row by row. */
export function findFreeSpot(dashboard: Dashboard, w: number, h: number): Rect {
  const width = Math.min(w, dashboard.columns)
  const maxY = dashboard.widgets.reduce((m, wi) => Math.max(m, rectOf(wi).y + rectOf(wi).h), 0)
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= dashboard.columns - width; x++) {
      const rect = { x, y, w: width, h }
      if (!overlapsAny(dashboard, rect)) return rect
    }
  }
  return { x: 0, y: maxY, w: width, h }
}
