import { create } from 'zustand'
import { newWidgetId, type Dashboard, type WidgetInstance } from '../model/dashboard'
import { clampRect, collides, findFreeSpot, projectDashboard, rectOf, tabletRects, type BumpPlan } from '../model/layout'
import type { Rect } from '../model/dashboard'
import { getWidgetDefinition } from '../widgets'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
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
  saveNeedsAuth: boolean
  selectedIds: string[]
  panelOpen: boolean
  paletteOpen: boolean
  dashSettingsOpen: boolean
  bp: 'lg' | 'md'
  placing: PlacingWidget | null
}

export interface PlacingWidget {
  type: string
  configOverrides?: Record<string, unknown>
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
  saveNeedsAuth: false,
  selectedIds: [],
  panelOpen: false,
  paletteOpen: false,
  dashSettingsOpen: false,
  bp: 'lg',
  placing: null
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
    saveNeedsAuth: false,
    selectedIds: [],
    panelOpen: false,
    paletteOpen: false,
    dashSettingsOpen: false,
    bp: 'lg',
    placing: null
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
    saveNeedsAuth: false,
    selectedIds: [],
    panelOpen: false,
    paletteOpen: false,
    dashSettingsOpen: false,
    bp: 'lg',
    placing: null
  })
}

// consecutive calls with the same coalesceKey fold into one undo entry
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
    dirty: true
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
    dirty: true
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
    dirty: true
  })
}

export function selectWidget(id: string | null): void {
  useEditorStore.setState((s) => ({
    selectedIds: id === null ? [] : [id],
    panelOpen: id !== null,
    lastCoalesceKey: null,
    dashSettingsOpen: id !== null ? false : s.dashSettingsOpen
  }))
}

export function toggleWidgetSelection(id: string): void {
  useEditorStore.setState((s) => {
    const has = s.selectedIds.includes(id)
    return {
      selectedIds: has ? s.selectedIds.filter((w) => w !== id) : [...s.selectedIds, id],
      panelOpen: false, // multi-select intent: never pop the panel open
      lastCoalesceKey: null,
      dashSettingsOpen: false
    }
  })
}

export function addToSelection(id: string): void {
  useEditorStore.setState((s) => ({
    selectedIds: s.selectedIds.includes(id) ? s.selectedIds : [...s.selectedIds, id],
    panelOpen: false,
    lastCoalesceKey: null,
    dashSettingsOpen: false
  }))
}

export function setSelection(ids: string[]): void {
  useEditorStore.setState((s) => ({
    selectedIds: [...ids],
    panelOpen: false,
    lastCoalesceKey: null,
    dashSettingsOpen: ids.length > 0 ? false : s.dashSettingsOpen
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
    dashSettingsOpen: false
  })
}

export function setPaletteOpen(open: boolean): void {
  useEditorStore.setState({ paletteOpen: open })
}

export function setDashSettingsOpen(open: boolean): void {
  useEditorStore.setState((s) => ({
    dashSettingsOpen: open,
    selectedIds: open ? [] : s.selectedIds,
    lastCoalesceKey: null
  }))
}

export function updateDashboardMeta(
  patch: Partial<
    Pick<
      Dashboard,
      'name' | 'icon' | 'hideInSidebar' | 'background' | 'columns' | 'mdColumns' | 'rowHeight' | 'gap' | 'textSize' | 'stackOrder'
    >
  >,
  coalesceKey: string | null = null
): void {
  applyChange((draft) => {
    Object.assign(draft, patch)
    if (patch.columns !== undefined) {
      for (const w of draft.widgets) {
        w.layout = { ...w.layout, lg: clampRect(rectOf(w), draft.columns) }
      }
    }
    if (patch.mdColumns !== undefined) {
      const rects = tabletRects(draft)
      const columns = projectDashboard(draft, 'md').columns
      for (const w of draft.widgets) {
        w.layout = { ...w.layout, md: clampRect(rects.get(w.id) ?? rectOf(w), columns) }
      }
    }
  }, coalesceKey)
}

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
      layout: layoutForNew(draft, s.bp, rect)
    }
    draft.widgets.push(widget)
  })
  useEditorStore.setState({ selectedIds: [id], panelOpen: true, paletteOpen: false })
}

export function startPlacing(placing: PlacingWidget): void {
  useEditorStore.setState({ placing })
}

export function cancelPlacing(): void {
  if (useEditorStore.getState().placing) useEditorStore.setState({ placing: null })
}

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
      layout: layoutForNew(draft, s.bp, rect)
    })
  })
  useEditorStore.setState({ selectedIds: [id], panelOpen: true, paletteOpen: false, placing: null })
  return true
}

export function removeWidget(id: string): void {
  removeWidgets([id])
}

export function removeWidgets(ids: string[]): void {
  if (ids.length === 0) return
  const drop = new Set(ids)
  applyChange((draft) => {
    draft.widgets = draft.widgets.filter((w) => !drop.has(w.id))
    if (draft.stackOrder) draft.stackOrder = draft.stackOrder.filter((w) => !drop.has(w))
  })
  useEditorStore.setState((s) => ({ selectedIds: s.selectedIds.filter((w) => !drop.has(w)) }))
}

export function pasteWidgets(items: ClipboardWidget[]): void {
  if (items.length === 0) return
  const s = useEditorStore.getState()
  if (!s.draft) return

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
  useEditorStore.setState({ selectedIds: newIds, panelOpen: false, dashSettingsOpen: false })
}

export function updateWidgetConfig(id: string, key: string, value: unknown): void {
  applyChange((draft) => {
    const widget = draft.widgets.find((w) => w.id === id)
    if (widget) widget.config = { ...widget.config, [key]: value }
  }, `config:${id}:${key}`)
}

export function updateWidgetConfigs(id: string, patch: Record<string, unknown>): void {
  applyChange((draft) => {
    const widget = draft.widgets.find((w) => w.id === id)
    if (widget) widget.config = { ...widget.config, ...patch }
  })
}

export function setWidgetRect(id: string, rect: Rect, displaced?: BumpPlan): boolean {
  const s = useEditorStore.getState()
  if (!s.draft) return false
  const bp = s.bp
  const view = projectDashboard(s.draft, bp)
  const clamped = clampRect(rect, view.columns)
  const plannedRect = (w: WidgetInstance): Rect => displaced?.get(w.id) ?? rectOf(w)
  if (view.widgets.some((w) => w.id !== id && collides(clamped, plannedRect(w)))) return false
  const current = view.widgets.find((w) => w.id === id)
  if (!current) return false
  const cur = rectOf(current)
  if (!displaced?.size && cur.x === clamped.x && cur.y === clamped.y && cur.w === clamped.w && cur.h === clamped.h) {
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

function layoutForNew(draft: Dashboard, bp: 'lg' | 'md', rect: Rect): WidgetInstance['layout'] {
  if (bp === 'lg') return { lg: clampRect(rect, draft.columns) }
  return {
    lg: clampRect(rect, draft.columns),
    md: clampRect(rect, projectDashboard(draft, 'md').columns)
  }
}

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

let saveInFlight = false

export async function saveDraft(keepEditing = false): Promise<boolean> {
  const s = useEditorStore.getState()
  if (!s.draft) return false
  if (saveInFlight) return false
  saveInFlight = true
  useEditorStore.setState({ saving: true, saveError: null, saveNeedsAuth: false })
  try {
    await saveDashboard(clone(s.draft))
    void collectUnusedBackgrounds([s.draft.background])
    if (keepEditing) useEditorStore.setState({ saving: false, dirty: false })
    else stopEditing()
    return true
  } catch (err) {
    useEditorStore.setState({
      saving: false,
      saveError: errorText(err),
      saveNeedsAuth: err instanceof ApiError && (err.status === 401 || err.status === 403)
    })
    return false
  } finally {
    saveInFlight = false
  }
}
