/**
 * Edit-mode state machine.
 *
 * Editing works on a local draft copy of the dashboard; nothing touches the server until Save.
 * Every mutation goes through {@link applyChange}, which maintains the undo/redo stacks.
 * Rapid same-field tweaks (typing in a settings input, dragging a slider) pass a `coalesceKey`
 * so they collapse into a single undo entry.
 */
import { create } from 'zustand'
import { newWidgetId, type Dashboard, type WidgetInstance } from '../model/dashboard'
import { clampRect, collides, findFreeSpot, projectDashboard, rectOf, tabletRects, type BumpPlan } from '../model/layout'
import type { Rect } from '../model/dashboard'
import { getWidgetDefinition } from '../widgets'
import type { ClipboardWidget } from './clipboard'
import { collectUnusedBackgrounds, saveDashboard } from './config'

const UNDO_LIMIT = 50

interface EditorState {
  editing: boolean
  draft: Dashboard | null
  original: Dashboard | null
  undoStack: Dashboard[]
  redoStack: Dashboard[]
  lastCoalesceKey: string | null
  dirty: boolean
  saving: boolean
  saveError: string | null
  /**
   * The selected widget ids. A single selection can open that widget's settings panel (see
   * panelOpen); multiple selection enables batch copy/cut/delete. Empty = nothing selected.
   */
  selectedIds: string[]
  /**
   * Whether the single-widget settings panel is open. Only an explicit single-select (a plain
   * click, a drag-drop, adding from the palette) opens it - Ctrl/Shift-click, marquee and
   * long-press signal multi-select intent, and popping the panel open there both surprises and
   * changes the zoom the grid is drawn at, moving the very widgets the user is about to click.
   */
  panelOpen: boolean
  paletteOpen: boolean
  dashSettingsOpen: boolean
  /**
   * Which layout the grid edits: the desktop one, or the tablet one (see MD_BELOW). Only ever
   * 'md' while the user has explicitly switched to the tablet layout; every rect written goes to
   * this breakpoint's slot.
   */
  bp: 'lg' | 'md'
  /**
   * A widget being dragged out of the palette onto the grid. Set once the press on a palette
   * card has clearly moved; the grid then previews where it would land and places it on release.
   * Null the rest of the time, so nothing about the normal editor path changes.
   */
  placing: PlacingWidget | null
}

/** The widget a palette drag is carrying: what to create, and how big it is on the grid. */
export interface PlacingWidget {
  type: string
  /** Config the palette wants on the new instance (a custom widget's definition reference). */
  configOverrides?: Record<string, unknown>
  /** Name shown in the drop placeholder, so the target is identifiable under a finger. */
  name: string
  w: number
  h: number
}

export const useEditorStore = create<EditorState>(() => ({
  editing: false,
  draft: null,
  original: null,
  undoStack: [],
  redoStack: [],
  lastCoalesceKey: null,
  dirty: false,
  saving: false,
  saveError: null,
  selectedIds: [],
  panelOpen: false,
  paletteOpen: false,
  dashSettingsOpen: false,
  bp: 'lg',
  placing: null,
}))

const clone = <T>(value: T): T => structuredClone(value)

export function startEditing(dashboard: Dashboard): void {
  useEditorStore.setState({
    editing: true,
    draft: clone(dashboard),
    original: dashboard,
    undoStack: [],
    redoStack: [],
    lastCoalesceKey: null,
    dirty: false,
    saving: false,
    saveError: null,
    selectedIds: [],
    panelOpen: false,
    paletteOpen: false,
    dashSettingsOpen: false,
    bp: 'lg',
    placing: null,
  })
}

export function stopEditing(): void {
  useEditorStore.setState({
    editing: false,
    draft: null,
    original: null,
    undoStack: [],
    redoStack: [],
    lastCoalesceKey: null,
    dirty: false,
    saving: false,
    saveError: null,
    selectedIds: [],
    panelOpen: false,
    paletteOpen: false,
    dashSettingsOpen: false,
    bp: 'lg',
    placing: null,
  })
}

/**
 * Apply a mutation to the draft. The mutator receives a fresh copy it may modify in place.
 * Consecutive calls with the same non-null `coalesceKey` fold into one undo entry.
 */
export function applyChange(mutate: (draft: Dashboard) => void, coalesceKey: string | null = null): void {
  const s = useEditorStore.getState()
  if (!s.draft) return
  const next = clone(s.draft)
  mutate(next)

  const coalesce = coalesceKey !== null && coalesceKey === s.lastCoalesceKey
  useEditorStore.setState({
    draft: next,
    undoStack: coalesce ? s.undoStack : [...s.undoStack.slice(-UNDO_LIMIT + 1), s.draft],
    redoStack: [],
    lastCoalesceKey: coalesceKey,
    dirty: true,
  })
}

export function undo(): void {
  const s = useEditorStore.getState()
  const prev = s.undoStack[s.undoStack.length - 1]
  if (!s.draft || !prev) return
  useEditorStore.setState({
    draft: prev,
    undoStack: s.undoStack.slice(0, -1),
    redoStack: [...s.redoStack, s.draft],
    lastCoalesceKey: null,
    dirty: true,
  })
}

export function redo(): void {
  const s = useEditorStore.getState()
  const next = s.redoStack[s.redoStack.length - 1]
  if (!s.draft || !next) return
  useEditorStore.setState({
    draft: next,
    redoStack: s.redoStack.slice(0, -1),
    undoStack: [...s.undoStack, s.draft],
    lastCoalesceKey: null,
    dirty: true,
  })
}

/**
 * Replace the selection with a single widget (or clear it with null). The widget panel and the
 * dashboard-settings panel share one surface, so selecting a widget closes the dashboard panel.
 */
export function selectWidget(id: string | null): void {
  useEditorStore.setState((s) => ({
    selectedIds: id === null ? [] : [id],
    // An explicit single-select is the one gesture that opens the settings panel.
    panelOpen: id !== null,
    lastCoalesceKey: null,
    dashSettingsOpen: id !== null ? false : s.dashSettingsOpen,
  }))
}

/** Add a widget to the selection if absent, remove it if present (Ctrl/Cmd-click). */
export function toggleWidgetSelection(id: string): void {
  useEditorStore.setState((s) => {
    const has = s.selectedIds.includes(id)
    return {
      selectedIds: has ? s.selectedIds.filter((w) => w !== id) : [...s.selectedIds, id],
      panelOpen: false, // multi-select intent: never pop the panel open
      lastCoalesceKey: null,
      dashSettingsOpen: false,
    }
  })
}

/** Add a widget to the selection without removing it if already present (Shift-click). */
export function addToSelection(id: string): void {
  useEditorStore.setState((s) => ({
    selectedIds: s.selectedIds.includes(id) ? s.selectedIds : [...s.selectedIds, id],
    panelOpen: false,
    lastCoalesceKey: null,
    dashSettingsOpen: false,
  }))
}

/** Replace the whole selection (used by marquee select and select-all). */
export function setSelection(ids: string[]): void {
  useEditorStore.setState((s) => ({
    selectedIds: [...ids],
    panelOpen: false,
    lastCoalesceKey: null,
    // The dashboard-settings panel shares the surface, so close it once anything is selected.
    dashSettingsOpen: ids.length > 0 ? false : s.dashSettingsOpen,
  }))
}

export function clearSelection(): void {
  useEditorStore.setState({ selectedIds: [], panelOpen: false, lastCoalesceKey: null })
}

export function selectAll(): void {
  const s = useEditorStore.getState()
  if (!s.draft) return
  useEditorStore.setState({
    selectedIds: s.draft.widgets.map((w) => w.id),
    panelOpen: false,
    lastCoalesceKey: null,
    dashSettingsOpen: false,
  })
}

export function setPaletteOpen(open: boolean): void {
  useEditorStore.setState({ paletteOpen: open })
}

export function setDashSettingsOpen(open: boolean): void {
  useEditorStore.setState((s) => ({
    dashSettingsOpen: open,
    // Opening the dashboard panel clears any widget selection (they share the surface).
    selectedIds: open ? [] : s.selectedIds,
    lastCoalesceKey: null,
  }))
}

/**
 * Edit dashboard-level fields (name / grid geometry / stack order) on the draft. Shrinking
 * the column count clamps every widget rect into the new bounds; resulting overlaps are left
 * for the user to resolve (undo restores the previous layout in one step).
 */
export function updateDashboardMeta(
  patch: Partial<
    Pick<
      Dashboard,
      | 'name'
      | 'icon'
      | 'hideInSidebar'
      | 'background'
      | 'columns'
      | 'mdColumns'
      | 'rowHeight'
      | 'gap'
      | 'textSize'
      | 'stackOrder'
    >
  >,
  coalesceKey: string | null = null,
): void {
  applyChange((draft) => {
    Object.assign(draft, patch)
    if (patch.columns !== undefined) {
      for (const w of draft.widgets) {
        w.layout = { ...w.layout, lg: clampRect(rectOf(w), draft.columns) }
      }
    }
    if (patch.mdColumns !== undefined) {
      // Same rule as the desktop column count: rects are clamped into the narrower grid and any
      // resulting overlap is the user's to resolve (one undo restores the previous arrangement).
      const rects = tabletRects(draft)
      const columns = projectDashboard(draft, 'md').columns
      for (const w of draft.widgets) {
        w.layout = { ...w.layout, md: clampRect(rects.get(w.id) ?? rectOf(w), columns) }
      }
    }
  }, coalesceKey)
}

/** Add a widget of the given type at the first free spot; select it. */
export function addWidget(type: string, configOverrides?: Record<string, unknown>): void {
  const def = getWidgetDefinition(type)
  const s = useEditorStore.getState()
  if (!def || !s.draft) return

  const id = newWidgetId()
  applyChange((draft) => {
    const rect = findFreeSpot(projectDashboard(draft, s.bp), def.defaultSize.w, def.defaultSize.h)
    const widget: WidgetInstance = {
      id,
      type,
      config: { ...(def.defaultConfig() as Record<string, unknown>), ...configOverrides },
      layout: layoutForNew(draft, s.bp, rect),
    }
    draft.widgets.push(widget)
  })
  // A freshly added widget opens its settings - the natural next step is configuring it.
  useEditorStore.setState({ selectedIds: [id], panelOpen: true, paletteOpen: false })
}

/**
 * Palette drag-to-place. The palette starts it, the grid previews it, and `addWidgetAt` finishes
 * it - the same `applyChange` path as any other edit, so it is one undo step and Save persists it
 * like everything else.
 */
export function startPlacing(placing: PlacingWidget): void {
  useEditorStore.setState({ placing })
}

export function cancelPlacing(): void {
  if (useEditorStore.getState().placing) useEditorStore.setState({ placing: null })
}

/** Drop the widget being placed at an exact grid rect. Returns false if there was nothing to do. */
export function addWidgetAt(rect: Rect): boolean {
  const s = useEditorStore.getState()
  const placing = s.placing
  if (!placing || !s.draft) return false
  const def = getWidgetDefinition(placing.type)
  if (!def) {
    useEditorStore.setState({ placing: null })
    return false
  }
  const id = newWidgetId()
  applyChange((draft) => {
    draft.widgets.push({
      id,
      type: placing.type,
      config: { ...(def.defaultConfig() as Record<string, unknown>), ...placing.configOverrides },
      layout: layoutForNew(draft, s.bp, rect),
    })
  })
  useEditorStore.setState({ selectedIds: [id], panelOpen: true, paletteOpen: false, placing: null })
  return true
}

export function removeWidget(id: string): void {
  removeWidgets([id])
}

/** Delete a set of widgets in one undo step and drop them from the selection/stack order. */
export function removeWidgets(ids: string[]): void {
  if (ids.length === 0) return
  const drop = new Set(ids)
  applyChange((draft) => {
    draft.widgets = draft.widgets.filter((w) => !drop.has(w.id))
    // Drop them from the pinned stack order too, or deleted ids accumulate there for good.
    if (draft.stackOrder) draft.stackOrder = draft.stackOrder.filter((w) => !drop.has(w))
  })
  useEditorStore.setState((s) => ({ selectedIds: s.selectedIds.filter((w) => !drop.has(w)) }))
}

/**
 * Paste copied widgets onto the draft: the whole group drops into the first free region big
 * enough to hold its bounding box, keeping the widgets' relative arrangement. Each gets a fresh
 * id; the pasted widgets become the new selection.
 */
export function pasteWidgets(items: ClipboardWidget[]): void {
  if (items.length === 0) return
  const s = useEditorStore.getState()
  if (!s.draft) return

  // Normalise the group so its top-left corner sits at (0,0), then measure the bounding box.
  const minX = Math.min(...items.map((i) => i.rect.x))
  const minY = Math.min(...items.map((i) => i.rect.y))
  const bboxW = Math.max(...items.map((i) => i.rect.x - minX + i.rect.w))
  const bboxH = Math.max(...items.map((i) => i.rect.y - minY + i.rect.h))

  const newIds: string[] = []
  const bp = useEditorStore.getState().bp
  applyChange((draft) => {
    const base = findFreeSpot(projectDashboard(draft, bp), bboxW, bboxH)
    for (const item of items) {
      const id = newWidgetId()
      newIds.push(id)
      const rect = { x: base.x + (item.rect.x - minX), y: base.y + (item.rect.y - minY), w: item.rect.w, h: item.rect.h }
      draft.widgets.push({ id, type: item.type, config: clone(item.config), layout: layoutForNew(draft, bp, rect) })
    }
  })
  // Pasted widgets are selected for an immediate move/delete, without popping the panel.
  useEditorStore.setState({ selectedIds: newIds, panelOpen: false, dashSettingsOpen: false })
}

export function updateWidgetConfig(id: string, key: string, value: unknown): void {
  applyChange((draft) => {
    const widget = draft.widgets.find((w) => w.id === id)
    if (widget) widget.config = { ...widget.config, [key]: value }
  }, `config:${id}:${key}`)
}

/**
 * Move/resize a widget; returns false (and changes nothing) if the target overlaps.
 *
 * `displaced` carries a bump plan (see planBump): the widgets the move pushes aside, relocated
 * in the same change so the whole rearrangement is one undo step. The overlap guard then judges
 * the target against those planned positions rather than the current ones.
 */
export function setWidgetRect(id: string, rect: Rect, displaced?: BumpPlan): boolean {
  const s = useEditorStore.getState()
  if (!s.draft) return false
  const bp = s.bp
  // Collisions and clamping are judged on the layout being edited, which the projection puts in
  // the lg slots; the write below goes back into that breakpoint's own slot.
  const view = projectDashboard(s.draft, bp)
  const clamped = clampRect(rect, view.columns)
  const plannedRect = (w: WidgetInstance): Rect => displaced?.get(w.id) ?? rectOf(w)
  if (view.widgets.some((w) => w.id !== id && collides(clamped, plannedRect(w)))) return false
  const current = view.widgets.find((w) => w.id === id)
  if (!current) return false
  const cur = rectOf(current)
  if (
    !displaced?.size &&
    cur.x === clamped.x &&
    cur.y === clamped.y &&
    cur.w === clamped.w &&
    cur.h === clamped.h
  ) {
    return true // no-op move; don't create an undo entry
  }
  applyChange((draft) => {
    for (const widget of draft.widgets) {
      if (widget.id === id) {
        widget.layout = { ...widget.layout, [bp]: clamped }
        continue
      }
      const to = displaced?.get(widget.id)
      if (to) widget.layout = { ...widget.layout, [bp]: to }
    }
  })
  return true
}

/**
 * Switch which layout the grid edits.
 *
 * Turning the tablet layout on for the first time materialises it for every widget in one undo
 * step: from then on the tablet rects are explicit, so editing one widget cannot silently reflow
 * the others, and the dashboard renders the same thing before and after the switch.
 */
export function setEditBreakpoint(bp: 'lg' | 'md'): void {
  const s = useEditorStore.getState()
  if (s.bp === bp) return
  if (bp === 'md' && s.draft && !s.draft.widgets.every((w) => w.layout.md)) {
    const rects = tabletRects(s.draft)
    applyChange((draft) => {
      for (const w of draft.widgets) w.layout = { ...w.layout, md: rects.get(w.id) ?? rectOf(w) }
    })
  }
  useEditorStore.setState({ bp, selectedIds: [], panelOpen: false, placing: null })
}

/**
 * The layout slots a newly created widget gets. A widget added while editing the tablet layout
 * still has to exist on the desktop one, or it would be invisible there - so both are written,
 * each clamped to its own grid.
 */
function layoutForNew(draft: Dashboard, bp: 'lg' | 'md', rect: Rect): WidgetInstance['layout'] {
  if (bp === 'lg') return { lg: clampRect(rect, draft.columns) }
  return {
    lg: clampRect(rect, draft.columns),
    md: clampRect(rect, projectDashboard(draft, 'md').columns),
  }
}

/** Drop the tablet layout entirely: every width above the phone stack goes back to the desktop one. */
export function clearTabletLayout(): void {
  applyChange((draft) => {
    draft.mdColumns = undefined
    for (const w of draft.widgets) {
      if (w.layout.md) {
        const { md: _md, ...rest } = w.layout
        w.layout = rest
      }
    }
  })
  useEditorStore.setState({ bp: 'lg' })
}

/**
 * Persist the draft. On success the editor leaves edit mode and returns to run mode, so Save is
 * a clear, terminal exit; a failure keeps the draft open with the error shown so it can be
 * retried. Pass `keepEditing` to commit without leaving (not currently used by the UI).
 */
export async function saveDraft(keepEditing = false): Promise<boolean> {
  const s = useEditorStore.getState()
  if (!s.draft) return false
  useEditorStore.setState({ saving: true, saveError: null })
  try {
    await saveDashboard(clone(s.draft))
    // A background upload replaced during this edit is unreferenced now that the save landed.
    void collectUnusedBackgrounds([s.draft.background])
    if (keepEditing) useEditorStore.setState({ saving: false, dirty: false })
    else stopEditing()
    return true
  } catch (err) {
    useEditorStore.setState({
      saving: false,
      saveError: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
