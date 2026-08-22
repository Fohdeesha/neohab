/** Pure grid-layout math shared by the runtime grid and the editor. */
import { readableInk } from '../themes/contrast'
import type { Dashboard, Rect, WidgetInstance } from './dashboard'

/**
 * A stored value read as a number. Imported configurations carry numbers as strings, and a hand
 * edit can carry anything at all, so the fallback is what keeps the arithmetic downstream sane.
 */
function finite(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

/**
 * Where a widget sits on the desktop grid.
 *
 * Repaired at the read, like the column count and the row height: the editor clamps every rect it
 * writes, but a backup, a shared export or a hand edit is stored verbatim. An unreadable height
 * made `findFreeSpot` return `y: NaN`, which was then saved onto the next widget added, and a
 * negative `y` became a `grid-row` counted from the END of the grid, putting the widget somewhere
 * nobody had placed it.
 */
export function rectOf(widget: WidgetInstance): Rect {
  const stored = widget.layout.lg
  if (!stored) return { x: 0, y: 0, w: 3, h: 3 }
  return {
    x: Math.max(0, Math.round(finite(stored.x, 0))),
    y: Math.max(0, Math.round(finite(stored.y, 0))),
    w: Math.max(1, Math.round(finite(stored.w, 1))),
    h: Math.max(1, Math.round(finite(stored.h, 1))),
  }
}

export const DEFAULT_GAP = 8
/** Upper bound on a stored gap: past this a "grid" is a column of widgets separated by voids. */
const MAX_GAP = 400

/**
 * Below this container width the dashboard renders as a single-column stack. Includes
 * portrait tablets: a many-column grid squeezed under ~840px yields cells too small for
 * any control, so stacking is the usable rendering there too.
 */
export const STACK_BELOW = 840 // px
/** Assumed desktop width when computing stacked heights for 'match' dashboards. */
export const STACK_REFERENCE_WIDTH = 1280

/**
 * Below this container width (and at or above STACK_BELOW) a dashboard that has a tablet layout
 * renders it instead of the desktop one. A dashboard without one keeps rendering the desktop
 * layout at every width above STACK_BELOW, exactly as before - the tablet layout is opt-in.
 */
export const MD_BELOW = 1200 // px

/**
 * The docked settings/dashboard panel: its width, and the viewport at which it docks to the side
 * instead of rising as a bottom sheet. Both mirror app.css (`.nh-sheet--side`, and the media
 * query around it) - the panel's size is a CSS fact, and this is the arithmetic that has to agree
 * with it.
 */
export const SIDE_PANEL_WIDTH = 340
export const SIDE_PANEL_MIN = 900 // px of viewport

/**
 * How much to zoom the editing grid while a panel is docked beside it.
 *
 * A docked panel takes its width off the surface, and a narrower surface is a different
 * dashboard: cells shrink, so text and icons scale down and widgets shed the content they have
 * no room for - meaning the editor showed something other than what a save would produce. Zoom
 * fixes that where a transform could not: it is a LAYOUT zoom, so the grid inside is laid out at
 * the full run-mode width (container queries and all) and only drawn smaller.
 *
 * `available` is the surface's own content width, already short by the panel; the run-mode width
 * is that plus the panel, and the zoom is the ratio between them. 1 whenever no panel is docked,
 * or before the surface has been measured.
 */
export function editZoom(available: number, panelDocked: boolean): number {
  if (!panelDocked) return 1
  if (!Number.isFinite(available) || available <= 0) return 1
  return available / (available + SIDE_PANEL_WIDTH)
}

/** The three surfaces a dashboard can render on, in the order they appear as the screen grows. */
export type Surface = 'phone' | 'tablet' | 'desktop'

export function surfaceFor(containerWidth: number): Surface {
  if (containerWidth < STACK_BELOW) return 'phone'
  return containerWidth < MD_BELOW ? 'tablet' : 'desktop'
}

/** True once anything about a tablet layout has been authored. */
export function hasTabletLayout(dashboard: Dashboard): boolean {
  return dashboard.mdColumns !== undefined || dashboard.widgets.some((w) => w.layout.md !== undefined)
}

/**
 * The dashboard's column count, as a usable number. The editor clamps it to 1..60, but an
 * imported or hand-edited dashboard is written verbatim, and a zero divides the cell width to
 * Infinity - which takes the row height, the icon scale and the whole grid with it.
 */
export function columnsOf(dashboard: Dashboard): number {
  const v = dashboard.columns
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : 1
}

export function mdColumnsOf(dashboard: Dashboard): number {
  const v = dashboard.mdColumns
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.round(v) : columnsOf(dashboard)
}

/**
 * The gap between cells, as a usable number. The editor clamps it to 0..64; a stored `gap: "wide"`
 * made the cell width NaN and left the grid unable to lay anything out at all - the same failure
 * `columns: 0` used to cause, in the one geometry field that had no guard.
 */
export function gapOf(dashboard: Dashboard): number {
  const v = dashboard.gap
  if (v === undefined || v === null) return DEFAULT_GAP
  const n = finite(v, NaN)
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_GAP, Math.round(n))) : DEFAULT_GAP
}

/**
 * Where each widget sits on the tablet grid: its stored `layout.md` when it has one, otherwise
 * derived. Deriving copies the desktop rect when the tablet grid is the same width (so opting in
 * starts from exactly what is on screen), and otherwise reflows the widgets in stacked order into
 * the narrower grid - which is what the narrower grid is for, and never overlaps.
 */
export function tabletRects(dashboard: Dashboard): Map<string, Rect> {
  const columns = mdColumnsOf(dashboard)
  const out = new Map<string, Rect>()
  // Stored tablet rects are clamped like every other: the editor keeps them inside the grid when
  // the column count changes, but an imported or hand-edited one can be wider than the grid it
  // lands in, and would then render straight over the edge.
  if (columns === columnsOf(dashboard)) {
    for (const w of dashboard.widgets) out.set(w.id, clampRect(w.layout.md ?? rectOf(w), columns))
    return out
  }
  // Reflow: place each widget, in the order a phone would stack them, at the first free spot of
  // the narrower grid. `placed` is a scratch dashboard so findFreeSpot sees what is already down.
  const placed: Dashboard = { ...dashboard, columns, widgets: [] }
  for (const w of stackedOrder(dashboard)) {
    const stored = w.layout.md
    const source = rectOf(w)
    const rect = stored
      ? clampRect(stored, columns)
      : findFreeSpot(placed, Math.min(source.w, columns), source.h)
    out.set(w.id, rect)
    placed.widgets = [...placed.widgets, { ...w, layout: { lg: rect } }]
  }
  return out
}

/**
 * A dashboard as it looks at one breakpoint, with that breakpoint's rects and column count in the
 * `lg` slots. Everything else - the grids, the bump planner, free-spot search - then works on the
 * tablet layout unchanged. 'lg' returns the dashboard itself, so the desktop path is untouched.
 */
export function projectDashboard(dashboard: Dashboard, bp: 'lg' | 'md'): Dashboard {
  if (bp === 'lg') return dashboard
  const rects = tabletRects(dashboard)
  return {
    ...dashboard,
    columns: mdColumnsOf(dashboard),
    widgets: dashboard.widgets.map((w) => ({ ...w, layout: { ...w.layout, lg: rects.get(w.id) ?? rectOf(w) } })),
  }
}

/**
 * Surfaces a widget is hidden on (`config.hideOn`, a universal setting): show a chart only on the
 * desktop, keep a big control off the phone stack. Tolerates a single string, and ignores values
 * that are not surfaces, like every other imported config value.
 */
export function hiddenSurfaces(widget: WidgetInstance): Surface[] {
  const raw = (widget.config as Record<string, unknown>).hideOn
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
  return list.filter((s): s is Surface => s === 'phone' || s === 'tablet' || s === 'desktop')
}

export function isHiddenOn(widget: WidgetInstance, surface: Surface): boolean {
  return hiddenSurfaces(widget).includes(surface)
}

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
  const gap = gapOf(dashboard)
  const columns = columnsOf(dashboard)
  // Floored at 1px: many columns at a wide gap can want more room than the container has, and a
  // negative width would flow into every scale below and into grid-template-columns itself.
  const colWidth = Math.max(1, (containerWidth - gap * (columns - 1)) / columns)
  // A fixed row height comes from the same unvalidated config, so it gets the same treatment.
  const fixed = typeof dashboard.rowHeight === 'number' && Number.isFinite(dashboard.rowHeight)
  const rowHeight = fixed ? Math.max(8, dashboard.rowHeight as number) : Math.max(8, colWidth)
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

/**
 * The dashboard's authored text-size multiplier (`textSize` percent, 100 = normal), applied on
 * top of the automatic scaling everywhere - one knob that means the same thing on a desktop
 * grid and a phone stack. Clamped so a garbage import can't render text invisible or absurd.
 */
function dashTextScale(dashboard: Dashboard): number {
  const v = dashboard.textSize
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(3, Math.max(0.5, v / 100)) : 1
}

function baseTextScale(dashboard: Dashboard, rowHeight: number): number {
  return Math.max(MIN_TEXT_SCALE, iconScale(dashboard, rowHeight))
}

export function textScale(dashboard: Dashboard, rowHeight: number): number {
  return dashTextScale(dashboard) * baseTextScale(dashboard, rowHeight)
}

/**
 * A stacked row a phone can comfortably read full-size text in: enough for a scaled icon, the
 * gap under it and a wrapped label. Below this the scale eases back down to the floor.
 */
export const STACK_COMFORT_HEIGHT = 96

/**
 * Text scale for one row of the single-column stack.
 *
 * The grid's proportional scale is the wrong measure here. Stacked rows are as wide as the
 * viewport and as tall as they would be on a reference desktop, so the scale would sit at its
 * floor on every phone - a fixed 0.8 no matter how big the screen - and render tiny text in a
 * roomy full-width row. Size it by the room the row actually has instead: full size once the row
 * can hold an icon and a label, easing to the floor for the short rows a many-column dashboard
 * stacks into. Never below the grid scale, so this can only ever add room, and never above 1:
 * a full-width row has width to spare, so there is nothing to gain by growing past normal
 * reading size.
 */
export function stackedTextScale(dashboard: Dashboard, unit: number, cellHeight: number): number {
  return (
    dashTextScale(dashboard) *
    Math.max(baseTextScale(dashboard, unit), Math.min(1, cellHeight / STACK_COMFORT_HEIGHT))
  )
}

/**
 * A single widget's text-size override (`config.textSize` percent, a universal setting every
 * widget offers), as the multiplier its cell sets in `--nh-widgetscale`. Undefined when unset
 * or 100, so the cell carries no style for the common case. Tolerates string-stored numbers
 * like every other imported config value.
 */
export function widgetTextScale(widget: WidgetInstance): number | undefined {
  const raw = (widget.config as Record<string, unknown>).textSize
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
  if (!Number.isFinite(n) || n === 100) return undefined
  return Math.min(3, Math.max(0.5, n / 100))
}

/**
 * A widget's header ("Name") alignment (`config.labelAlign`, a universal setting on every
 * headered widget), as the justify-content its cell sets in `--nh-labelalign`. Undefined when
 * UNSET so the common case carries no style and a theme may restyle the default; an explicit
 * "Left" still pins flex-start, so the user's choice beats a theme that centers by default.
 * Unknown values fall back like unset.
 */
export function widgetLabelAlign(widget: WidgetInstance): 'flex-start' | 'center' | 'flex-end' | undefined {
  const v = (widget.config as Record<string, unknown>).labelAlign
  return v === 'center' ? 'center' : v === 'right' ? 'flex-end' : v === 'left' ? 'flex-start' : undefined
}

/**
 * A widget's tile accent (`config.accent`, a universal setting): the whole cell painted as a
 * solid block of the theme accent (`filled`), a muted wash of it (`tinted`), or left as it is
 * behind an accent-colored rule around the edge (`outlined`) - the way an operations board
 * frames the panel it is currently drilled into. Returned as the cell class suffix; undefined
 * (no class) for unset/unknown values.
 */
export function widgetAccent(widget: WidgetInstance): 'filled' | 'tinted' | 'outlined' | undefined {
  const v = (widget.config as Record<string, unknown>).accent
  return v === 'filled' || v === 'tinted' || v === 'outlined' ? v : undefined
}

/**
 * A widget's panel group (`config.group`, a universal setting): widgets that name the same
 * group are framed together as one panel. Whitespace-only and over-long values are ignored,
 * like every other value read out of stored configuration.
 */
export function widgetGroup(widget: WidgetInstance): string | undefined {
  const v = (widget.config as Record<string, unknown>).group
  return typeof v === 'string' && v.trim() !== '' && v.length <= 60 ? v.trim() : undefined
}

/** One panel frame: the grid rect enclosing a group, and the rule color to draw it in. */
export interface GroupFrame {
  group: string
  rect: Rect
  color?: string
}

/**
 * The frames to draw behind a set of widgets: one per named group, enclosing every member.
 *
 * A dashboard describes regions this way - "these tiles are one panel" - which a grid of
 * per-tile borders cannot say: it would rule every internal edge as well as the outside.
 * Insertion order is kept so the frames render deterministically, and the rule takes the
 * first member's accent color, so one group can differ from another.
 */
export function groupFrames(widgets: WidgetInstance[]): GroupFrame[] {
  const out = new Map<string, GroupFrame>()
  for (const w of widgets) {
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
      h: Math.max(b.y + b.h, r.y + r.h) - y,
    }
    found.color ??= widgetAccentColor(w)
  }
  return [...out.values()]
}

/**
 * True when the widget's header row is parked at the bottom of the card
 * (`config.labelPosition`); the cell then carries the `nh-labelbottom` class.
 */
export function widgetLabelBottom(widget: WidgetInstance): boolean {
  return (widget.config as Record<string, unknown>).labelPosition === 'bottom'
}

/**
 * A widget's accent color (`config.accentColor`, a universal setting): a CSS color the cell
 * exposes as `--nh-cellaccent`. The accent-tile styles and per-tile-accent themes (the LCD
 * console's colored zones) read it; unset means the theme accent. Stored config is untrusted,
 * so anything but a plain short string is ignored (the CSSOM rejects invalid colors anyway).
 */
export function widgetAccentColor(widget: WidgetInstance): string | undefined {
  const v = (widget.config as Record<string, unknown>).accentColor
  return typeof v === 'string' && v.trim() !== '' && v.length <= 40 ? v.trim() : undefined
}

/**
 * Ink for text drawn on this tile's own accent colour (`--nh-accent-ink` on the cell, shadowing
 * the theme's). Without it a tile given a pale accent keeps the theme's ink and can end up with
 * white text on yellow; with it, each tile's ink follows the colour it was actually given.
 * Undefined when the tile has no accent of its own, or names a colour we cannot read - the
 * theme's own ink then applies, exactly as before.
 */
export function widgetAccentInk(widget: WidgetInstance): string | undefined {
  const color = widgetAccentColor(widget)
  return color ? (readableInk(color) ?? undefined) : undefined
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
  const columns = columnsOf(dashboard)
  const width = Math.max(1, Math.min(w, columns))
  const maxY = dashboard.widgets.reduce((m, wi) => Math.max(m, rectOf(wi).y + rectOf(wi).h), 0)
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= columns - width; x++) {
      const rect = { x, y, w: width, h }
      if (!overlapsAny(dashboard, rect)) return rect
    }
  }
  return { x: 0, y: maxY, w: width, h }
}
