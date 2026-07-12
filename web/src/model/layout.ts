/** Pure grid-layout math shared by the runtime grid and the editor. */
import type { Dashboard, Rect, WidgetInstance } from './dashboard'

export function rectOf(widget: WidgetInstance): Rect {
  return widget.layout.lg ?? { x: 0, y: 0, w: 3, h: 3 }
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
