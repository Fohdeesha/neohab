/**
 * Edit-mode state machine.
 *
 * Editing works on a local draft copy of the dashboard; nothing touches the server until Save.
 * Every mutation goes through {@link applyChange}, which maintains the undo/redo stacks.
 * Rapid same-field tweaks (typing in a settings input, dragging a slider) pass a `coalesceKey`
 * so they collapse into a single undo entry.
 */
import { create } from 'zustand'
import type { Dashboard, WidgetInstance } from '../model/dashboard'
import { clampRect, collides, findFreeSpot, rectOf, type BumpPlan } from '../model/layout'
import type { Rect } from '../model/dashboard'
import { getWidgetDefinition } from '../widgets'
import { saveDashboard } from './config'

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
  selectedId: string | null
  paletteOpen: boolean
  dashSettingsOpen: boolean
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
  selectedId: null,
  paletteOpen: false,
  dashSettingsOpen: false,
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
    selectedId: null,
    paletteOpen: false,
    dashSettingsOpen: false,
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
    selectedId: null,
    paletteOpen: false,
    dashSettingsOpen: false,
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

export function selectWidget(id: string | null): void {
  // The widget panel and the dashboard-settings panel share the same surface.
  useEditorStore.setState((s) => ({
    selectedId: id,
    lastCoalesceKey: null,
    dashSettingsOpen: id !== null ? false : s.dashSettingsOpen,
  }))
}

export function setPaletteOpen(open: boolean): void {
  useEditorStore.setState({ paletteOpen: open })
}

export function setDashSettingsOpen(open: boolean): void {
  useEditorStore.setState((s) => ({
    dashSettingsOpen: open,
    selectedId: open ? null : s.selectedId,
    lastCoalesceKey: null,
  }))
}

/**
 * Edit dashboard-level fields (name / grid geometry / stack order) on the draft. Shrinking
 * the column count clamps every widget rect into the new bounds; resulting overlaps are left
 * for the user to resolve (undo restores the previous layout in one step).
 */
export function updateDashboardMeta(
  patch: Partial<Pick<Dashboard, 'name' | 'icon' | 'hideInSidebar' | 'columns' | 'rowHeight' | 'gap' | 'stackOrder'>>,
  coalesceKey: string | null = null,
): void {
  applyChange((draft) => {
    Object.assign(draft, patch)
    if (patch.columns !== undefined) {
      for (const w of draft.widgets) {
        w.layout = { ...w.layout, lg: clampRect(rectOf(w), draft.columns) }
      }
    }
  }, coalesceKey)
}

/** Add a widget of the given type at the first free spot; select it. */
export function addWidget(type: string, configOverrides?: Record<string, unknown>): void {
  const def = getWidgetDefinition(type)
  const s = useEditorStore.getState()
  if (!def || !s.draft) return

  const id = 'w-' + Math.random().toString(36).slice(2, 10)
  applyChange((draft) => {
    const rect = findFreeSpot(draft, def.defaultSize.w, def.defaultSize.h)
    const widget: WidgetInstance = {
      id,
      type,
      config: { ...(def.defaultConfig() as Record<string, unknown>), ...configOverrides },
      layout: { lg: rect },
    }
    draft.widgets.push(widget)
  })
  useEditorStore.setState({ selectedId: id, paletteOpen: false })
}

export function removeWidget(id: string): void {
  applyChange((draft) => {
    draft.widgets = draft.widgets.filter((w) => w.id !== id)
    // Drop it from the pinned stack order too, or deleted ids accumulate there for good.
    if (draft.stackOrder) draft.stackOrder = draft.stackOrder.filter((w) => w !== id)
  })
  const s = useEditorStore.getState()
  if (s.selectedId === id) useEditorStore.setState({ selectedId: null })
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
  const clamped = clampRect(rect, s.draft.columns)
  const plannedRect = (w: WidgetInstance): Rect => displaced?.get(w.id) ?? rectOf(w)
  if (s.draft.widgets.some((w) => w.id !== id && collides(clamped, plannedRect(w)))) return false
  const current = s.draft.widgets.find((w) => w.id === id)
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
        widget.layout = { ...widget.layout, lg: clamped }
        continue
      }
      const to = displaced?.get(widget.id)
      if (to) widget.layout = { ...widget.layout, lg: to }
    }
  })
  return true
}

export async function saveDraft(): Promise<boolean> {
  const s = useEditorStore.getState()
  if (!s.draft) return false
  useEditorStore.setState({ saving: true, saveError: null })
  try {
    await saveDashboard(clone(s.draft))
    useEditorStore.setState({ saving: false, dirty: false })
    return true
  } catch (err) {
    useEditorStore.setState({
      saving: false,
      saveError: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}
