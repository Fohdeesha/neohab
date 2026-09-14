import { readableInk } from '../themes/contrast'
import type { Dashboard, Rect, WidgetInstance } from './dashboard'

// stored config is untrusted: imported ones carry numbers as strings, and a hand edit can carry anything
function finite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

// repairs field by field, because clamping alone cannot fix a value that is not a number
export function sanitizeRect(stored: Partial<Rect> | undefined): Rect {
  if (!stored) return { x: 0, y: 0, w: 3, h: 3 }
  return {
    x: Math.max(0, Math.round(finite(stored.x, 0))),
    y: Math.max(0, Math.round(finite(stored.y, 0))),
    w: Math.max(1, Math.round(finite(stored.w, 1))),
    h: Math.max(1, Math.round(finite(stored.h, 1)))
  }
}

export function rectOf(widget: WidgetInstance): Rect {
  return sanitizeRect(widget.layout?.lg)
}

export const DEFAULT_GAP = 8
const MAX_GAP = 400

export const STACK_BELOW = 840 // px
export const STACK_REFERENCE_WIDTH = 1280

export const MD_BELOW = 1200 // px

export const SIDE_PANEL_WIDTH = 391
export const SIDE_PANEL_MIN = 900 // px of viewport

// a LAYOUT zoom, not a transform: the grid is laid out at the full run-mode width and only drawn smaller, so
// container queries still answer for the real cell
export function editZoom(available: number, panelDocked: boolean): number {
  if (!panelDocked) return 1
  if (!Number.isFinite(available) || available <= 0) return 1
  return available / (available + SIDE_PANEL_WIDTH)
}

export type Surface = 'phone' | 'tablet' | 'desktop'

export function surfaceFor(containerWidth: number): Surface {
  if (containerWidth < STACK_BELOW) return 'phone'
  return containerWidth < MD_BELOW ? 'tablet' : 'desktop'
}

export function hasTabletLayout(dashboard: Dashboard): boolean {
  return dashboard.mdColumns !== undefined || widgetsOf(dashboard).some((w) => w.layout.md !== undefined)
}

// a stored `columns: 0` divided the cell width to Infinity and took the whole grid with it
export function widgetsOf(dashboard: Dashboard): WidgetInstance[] {
  return Array.isArray(dashboard.widgets) ? dashboard.widgets : []
}

export function columnsFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.round(value) : 1
}

export function columnsOf(dashboard: Dashboard): number {
  return columnsFrom(dashboard.columns)
}

export function mdColumnsOf(dashboard: Dashboard): number {
  const v = dashboard.mdColumns
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : columnsOf(dashboard)
}

// a stored `gap: "wide"` made the cell width NaN
export function gapOf(dashboard: Dashboard): number {
  const v = dashboard.gap
  if (v === undefined || v === null) return DEFAULT_GAP
  const n = finite(v, NaN)
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_GAP, Math.round(n))) : DEFAULT_GAP
}

export function tabletRects(dashboard: Dashboard): Map<string, Rect> {
  const columns = mdColumnsOf(dashboard)
  const out = new Map<string, Rect>()
  const pinned = widgetsOf(dashboard).some((w) => w.layout.md !== undefined)
  // nothing has been moved on the tablet layout and the grid is the same width, so it IS the desktop one
  if (!pinned && columns === columnsOf(dashboard)) {
    for (const w of widgetsOf(dashboard)) out.set(w.id, clampRect(rectOf(w), columns))
    return out
  }
  const placed: Dashboard = { ...dashboard, columns, widgets: [] }
  const put = (w: WidgetInstance, rect: Rect): void => {
    out.set(w.id, rect)
    placed.widgets = [...placed.widgets, { ...w, layout: { lg: rect } }]
  }
  // a stored tablet rect is where the author put it, so those go down first and the rest are fitted
  // around them. Falling back to the desktop rect instead is how a widget added while editing the
  // desktop layout landed on top of one the tablet layout had moved.
  const order = stackedOrder(dashboard)
  for (const w of order) if (w.layout.md) put(w, clampRect(w.layout.md, columns))
  for (const w of order) {
    if (w.layout.md) continue
    const source = rectOf(w)
    put(w, findFreeSpot(placed, Math.min(source.w, columns), source.h))
  }
  return out
}

export function projectDashboard(dashboard: Dashboard, bp: 'lg' | 'md'): Dashboard {
  if (bp === 'lg') return dashboard
  const rects = tabletRects(dashboard)
  return {
    ...dashboard,
    columns: mdColumnsOf(dashboard),
    widgets: widgetsOf(dashboard).map((w) => ({ ...w, layout: { ...w.layout, lg: rects.get(w.id) ?? rectOf(w) } }))
  }
}

export function hiddenSurfaces(widget: WidgetInstance): Surface[] {
  const raw = (widget.config as Record<string, unknown>).hideOn
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  return list.filter((s): s is Surface => s === 'phone' || s === 'tablet' || s === 'desktop')
}

export function isHiddenOn(widget: WidgetInstance, surface: Surface): boolean {
  return hiddenSurfaces(widget).includes(surface)
}

export function stackedOrder(dashboard: Dashboard): WidgetInstance[] {
  const derived = [...widgetsOf(dashboard)].sort((a, b) => {
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

export function cellMetrics(dashboard: Dashboard, containerWidth: number): { gap: number; colWidth: number; rowHeight: number } {
  const gap = gapOf(dashboard)
  const columns = columnsOf(dashboard)
  const colWidth = Math.max(1, (containerWidth - gap * (columns - 1)) / columns)
  const fixed = typeof dashboard.rowHeight === 'number' && Number.isFinite(dashboard.rowHeight)
  const rowHeight = fixed ? Math.max(8, dashboard.rowHeight as number) : Math.max(8, colWidth)
  return { gap, colWidth, rowHeight }
}

export const ICON_REFERENCE_WIDTH = 1920

export function iconScale(dashboard: Dashboard, rowHeight: number): number {
  const ref = cellMetrics(dashboard, ICON_REFERENCE_WIDTH).rowHeight
  return ref > 0 ? rowHeight / ref : 1
}

export const TOUCH_TEXT_FLOOR = 0.8
export const POINTER_TEXT_FLOOR = 1

// both ends measured rather than chosen, by sweeping the scale over real labels at those row heights
export const POINTER_FULL_ROW = 100
export const POINTER_FLOOR_ROW = 85

export function textFloor(coarsePointer: boolean, rowHeight: number): number {
  if (coarsePointer) return TOUCH_TEXT_FLOOR
  const h = Number.isFinite(rowHeight) ? rowHeight : 0
  const t = Math.max(0, Math.min(1, (h - POINTER_FLOOR_ROW) / (POINTER_FULL_ROW - POINTER_FLOOR_ROW)))
  return TOUCH_TEXT_FLOOR + (POINTER_TEXT_FLOOR - TOUCH_TEXT_FLOOR) * t
}

function dashTextScale(dashboard: Dashboard): number {
  const v = dashboard.textSize
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(3, Math.max(0.5, v / 100)) : 1
}

function baseTextScale(dashboard: Dashboard, rowHeight: number, coarsePointer: boolean): number {
  return Math.max(textFloor(coarsePointer, rowHeight), iconScale(dashboard, rowHeight))
}

// required rather than defaulted, so a new surface has to say which pointer it is passing
export function textScale(dashboard: Dashboard, rowHeight: number, coarsePointer: boolean): number {
  return dashTextScale(dashboard) * baseTextScale(dashboard, rowHeight, coarsePointer)
}

/**
 * How tall one widget is in the stack.
 *
 * The row count is the rule for everything whose content stretches. It is the wrong rule for a
 * widget drawing something with a shape of its own: a 12x6 floor plan is 2:1 on the desktop and
 * becomes 0.6:1 full-width on a phone, so the plan letterboxes into a third of the card and the
 * rest is dead space. Such a widget keeps the PROPORTION its author gave the tile instead.
 *
 * Only ever shorter than the row count, never taller - a tall narrow tile was letterboxed on the
 * desktop too, and that is the author's own layout rather than something the stack invented.
 */
export function stackedCellHeight(
  dashboard: Dashboard,
  rect: Rect,
  stackedWidth: number,
  minPixelHeight: number,
  fixedShape: boolean
): number {
  const { gap, colWidth, rowHeight } = cellMetrics(dashboard, STACK_REFERENCE_WIDTH)
  const rows = rect.h * rowHeight
  const min = Number.isFinite(minPixelHeight) ? minPixelHeight : 0
  if (!fixedShape) return Math.round(Math.max(rows, min))
  const authoredW = rect.w * colWidth + (rect.w - 1) * gap
  const authoredH = rect.h * rowHeight + (rect.h - 1) * gap
  const shaped = authoredW > 0 && stackedWidth > 0 ? (stackedWidth * authoredH) / authoredW : rows
  return Math.round(Math.max(Math.min(rows, shaped), min))
}

export const STACK_COMFORT_HEIGHT = 96

export function stackedTextScale(dashboard: Dashboard, unit: number, cellHeight: number, coarsePointer: boolean): number {
  return (
    dashTextScale(dashboard) *
    Math.max(textFloor(coarsePointer, cellHeight), iconScale(dashboard, unit), Math.min(1, cellHeight / STACK_COMFORT_HEIGHT))
  )
}

export function widgetTextScale(widget: WidgetInstance): number | undefined {
  const raw = (widget.config as Record<string, unknown>).textSize
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n === 100) return undefined
  return Math.min(3, Math.max(0.5, n / 100))
}

export function widgetLabelAlign(widget: WidgetInstance): 'flex-start' | 'center' | 'flex-end' | undefined {
  const v = (widget.config as Record<string, unknown>).labelAlign
  return v === 'center' ? 'center' : v === 'right' ? 'flex-end' : v === 'left' ? 'flex-start' : undefined
}

export function widgetAccent(widget: WidgetInstance): 'filled' | 'tinted' | 'outlined' | undefined {
  const v = (widget.config as Record<string, unknown>).accent
  return v === 'filled' || v === 'tinted' || v === 'outlined' ? v : undefined
}

export function widgetGroup(widget: WidgetInstance): string | undefined {
  const v = (widget.config as Record<string, unknown>).group
  return typeof v === 'string' && v.trim() !== '' && v.length <= 60 ? v.trim() : undefined
}

export interface GroupFrame {
  group: string
  rect: Rect
  color?: string
}

export function groupFrames(widgets: WidgetInstance[]): GroupFrame[] {
  const out = new Map<string, GroupFrame>()
  for (const w of Array.isArray(widgets) ? widgets : []) {
    const group = widgetGroup(w)
    if (!group) continue
    const r = rectOf(w)
    const found = out.get(group)
    if (!found) {
      out.set(group, { group, rect: { ...r }, color: widgetAccentColor(w) })
      continue
    }
    const b = found.rect
    const x = Math.min(b.x, r.x)
    const y = Math.min(b.y, r.y)
    found.rect = {
      x,
      y,
      w: Math.max(b.x + b.w, r.x + r.w) - x,
      h: Math.max(b.y + b.h, r.y + r.h) - y
    }
    found.color ??= widgetAccentColor(w)
  }
  return [...out.values()]
}

export function widgetLabelBottom(widget: WidgetInstance): boolean {
  return (widget.config as Record<string, unknown>).labelPosition === 'bottom'
}

export function widgetAccentColor(widget: WidgetInstance): string | undefined {
  const v = (widget.config as Record<string, unknown>).accentColor
  return typeof v === 'string' && v.trim() !== '' && v.length <= 40 ? v.trim() : undefined
}

export function widgetAccentInk(widget: WidgetInstance): string | undefined {
  const color = widgetAccentColor(widget)
  return color ? (readableInk(color) ?? undefined) : undefined
}

export function collides(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function clampRect(rect: Rect, columns: number): Rect {
  const safe = sanitizeRect(rect)
  const cols = columnsFrom(columns)
  const w = Math.max(1, Math.min(safe.w, cols))
  const h = Math.max(1, safe.h)
  const x = Math.max(0, Math.min(safe.x, cols - w))
  const y = Math.max(0, safe.y)
  return { x, y, w, h }
}

export function overlapsAny(dashboard: Dashboard, rect: Rect, ignoreId?: string): boolean {
  return widgetsOf(dashboard).some((w) => w.id !== ignoreId && collides(rect, rectOf(w)))
}

export type BumpPlan = Map<string, Rect>

const MAX_BUMP_DEPTH = 200

export function planBump(dashboard: Dashboard, id: string, target: Rect): BumpPlan | null {
  const moving = widgetsOf(dashboard).find((w) => w.id === id)
  if (!moving) return null
  const from = rectOf(moving)
  const others = widgetsOf(dashboard).filter((w) => w.id !== id)
  const occupants = others.filter((w) => collides(target, rectOf(w)))
  if (occupants.length === 0) return new Map()

  const isLegal = (plan: BumpPlan): boolean => {
    const at = (w: WidgetInstance): Rect => plan.get(w.id) ?? rectOf(w)
    if (others.some((w) => collides(target, at(w)))) return false
    return others.every((w) => !plan.has(w.id) || others.every((o) => o.id === w.id || !collides(at(w), at(o))))
  }

  if (occupants.length === 1) {
    const other = rectOf(occupants[0])
    if (other.w === from.w && other.h === from.h) {
      const swap: BumpPlan = new Map([[occupants[0].id, { ...from }]])
      if (isLegal(swap)) return swap
    }
  }

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

  // bottom-up, so a displaced cluster keeps its stacking order
  const lowestFirst = [...occupants].sort((a, b) => rectOf(b).y - rectOf(a).y)
  for (const occupant of lowestFirst) {
    if (!pushBelow(occupant.id, target.y + target.h, 0)) return null
  }
  return isLegal(moved) ? moved : null
}

export function findFreeSpot(dashboard: Dashboard, w: number, h: number): Rect {
  const columns = columnsOf(dashboard)
  const width = Math.max(1, Math.min(Math.round(finite(w, 1)), columns))
  const height = Math.max(1, Math.round(finite(h, 1)))
  const maxY = widgetsOf(dashboard).reduce((m, wi) => Math.max(m, rectOf(wi).y + rectOf(wi).h), 0)
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= columns - width; x++) {
      const rect = { x, y, w: width, h: height }
      if (!overlapsAny(dashboard, rect)) return rect
    }
  }
  return { x: 0, y: maxY, w: width, h: height }
}
