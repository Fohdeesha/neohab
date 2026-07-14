/** Pure grid-layout math shared by the runtime grid and the editor. */
import type { Dashboard, Rect, WidgetInstance } from './dashboard'

export function rectOf(widget: WidgetInstance): Rect {
  return widget.layout.lg ?? { x: 0, y: 0, w: 3, h: 3 }
}

export const DEFAULT_GAP = 8

/**
 * Below this container width the dashboard renders as a single-column stack. Includes
 * portrait tablets: a many-column grid squeezed under ~840px yields cells too small for
 * any control, so stacking is the usable rendering there too.
 */
export const STACK_BELOW = 840 // px
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

/**
 * Icon sizes are authored in px as they render on a desktop-width dashboard (HABPanel configs
 * carried px values chosen against desktop cells). Rendering scales them with the actual cell
 * size so icons grow/shrink proportionally with the screen instead of staying fixed.
 */
export const ICON_REFERENCE_WIDTH = 1920

export function iconScale(dashboard: Dashboard, rowHeight: number): number {
  const ref = cellMetrics(dashboard, ICON_REFERENCE_WIDTH).rowHeight
  return ref > 0 ? rowHeight / ref : 1
}

/**
 * Text scales with the cell exactly like icons do, so a dashboard reads as one proportional
 * unit at any size - but only down to a floor, because text has a readability limit an icon
 * doesn't: a label shrunk to 7px is worse than a slightly-too-big one. At the floor the
 * remaining fit comes from the tight-cell padding sheds in app.css instead.
 */
export const MIN_TEXT_SCALE = 0.8

export function textScale(dashboard: Dashboard, rowHeight: number): number {
  return Math.max(MIN_TEXT_SCALE, iconScale(dashboard, rowHeight))
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

/** Where each widget displaced by a bump ends up: widget id -> its new rect. */
export type BumpPlan = Map<string, Rect>

/** Cascades terminate on their own (a push only ever moves a widget down); this is a backstop. */
const MAX_BUMP_DEPTH = 200

/**
 * Work out how to make room for `id` at `target` when widgets are already there.
 *
 * Two rules, tried in order:
 *  - a same-size 1:1 trade (the target covers exactly one widget the size of the dragged one)
 *    swaps the pair, so neighbours exchange places and nothing else on the dashboard moves;
 *  - otherwise each occupant is pushed straight down just far enough to clear the target,
 *    cascading into whatever it lands on.
 *
 * Returns the widgets that move (empty when the target was already free), or null if no legal
 * arrangement was found - the caller then rejects the drop rather than guessing.
 */
export function planBump(dashboard: Dashboard, id: string, target: Rect): BumpPlan | null {
  const moving = dashboard.widgets.find((w) => w.id === id)
  if (!moving) return null
  const from = rectOf(moving)
  const others = dashboard.widgets.filter((w) => w.id !== id)
  const occupants = others.filter((w) => collides(target, rectOf(w)))
  if (occupants.length === 0) return new Map()

  /**
   * A plan is legal when the dragged widget owns `target` outright and everything the plan
   * moved landed clear. Pairs the plan doesn't touch go unchecked on purpose: a dashboard can
   * already contain overlaps (shrinking the column count clamps rects into each other), and
   * those must not veto an unrelated bump.
   */
  const isLegal = (plan: BumpPlan): boolean => {
    const at = (w: WidgetInstance): Rect => plan.get(w.id) ?? rectOf(w)
    if (others.some((w) => collides(target, at(w)))) return false
    return others.every(
      (w) => !plan.has(w.id) || others.every((o) => o.id === w.id || !collides(at(w), at(o)))
    )
  }

  // 1:1 trade. Equal sizes mean the occupant lands exactly on the spot the dragged widget
  // vacates, so it always fits; isLegal still catches the case where the two rects overlap
  // each other (a nudge onto a neighbour), which would swap a widget onto its own target.
  if (occupants.length === 1) {
    const other = rectOf(occupants[0])
    if (other.w === from.w && other.h === from.h) {
      const swap: BumpPlan = new Map([[occupants[0].id, { ...from }]])
      if (isLegal(swap)) return swap
    }
  }

  // Push down. `placed` holds every widget's planned rect except the dragged one, which owns
  // `target` and is never pushed; each push moves a widget strictly downwards, so the cascade
  // cannot loop back onto the target or revisit a widget forever.
  const placed = new Map<string, Rect>()
  for (const w of others) placed.set(w.id, rectOf(w))
  const moved: BumpPlan = new Map()

  const pushBelow = (widgetId: string, minY: number, depth: number): boolean => {
    if (depth > MAX_BUMP_DEPTH) return false
    const rect = placed.get(widgetId)
    if (!rect) return false
    if (rect.y >= minY) return true // already clear
    const next = { ...rect, y: minY }
    placed.set(widgetId, next)
    moved.set(widgetId, next)
    for (const [otherId, otherRect] of placed) {
      if (otherId === widgetId) continue
      if (collides(next, otherRect) && !pushBelow(otherId, next.y + next.h, depth + 1)) return false
    }
    return true
  }

  // Bottom-up: the lowest occupant claims the row under the target first and the ones above it
  // then shove it further down, so a displaced cluster keeps its original stacking order.
  const lowestFirst = [...occupants].sort((a, b) => rectOf(b).y - rectOf(a).y)
  for (const occupant of lowestFirst) {
    if (!pushBelow(occupant.id, target.y + target.h, 0)) return null
  }
  return isLegal(moved) ? moved : null
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
