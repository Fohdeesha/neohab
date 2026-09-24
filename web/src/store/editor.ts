import { create } from 'zustand'
import { newWidgetId, type Dashboard, type WidgetInstance } from '../model/dashboard'
import {
  clampRect,
  collides,
  columnsFrom,
  findFreeSpot,
  fitToColumns,
  hiddenAfterRemoval,
  hiddenAfterShowing,
  hiddenSurfaces,
  layoutForNewWidget,
  mdColumnsOf,
  planRemoval,
  projectDashboard,
  rectOf,
  surfacesOf,
  tabletRects,
  widgetsOf,
  type BumpPlan,
  type Surface
} from '../model/layout'
import type { Rect } from '../model/dashboard'
import { getWidgetDefinition } from '../widgets'
import { ApiError } from '../api/client'
import { errorText } from '../api/errors'
import i18n from '../i18n'
import type { ClipboardWidget } from './clipboard'
import { notify } from './notify'
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
  // a column field commits as it is typed, so "12" passes through 1 on the way; fitting each step from the
  // layout as it was before the typing began keeps that 1 from squeezing every widget to one column for good
  const s = useEditorStore.getState()
  const origin = coalesceKey !== null && coalesceKey === s.lastCoalesceKey ? (s.undoStack[s.undoStack.length - 1] ?? s.draft) : s.draft
  applyChange((draft) => {
    Object.assign(draft, patch)
    if (!origin) return
    if (patch.columns !== undefined) {
      const fitted = fitToColumns(new Map(widgetsOf(origin).map((w) => [w.id, rectOf(w)])), columnsFrom(draft.columns))
      for (const w of draft.widgets) {
        const rect = fitted.get(w.id)
        if (rect) w.layout = { ...w.layout, lg: rect }
      }
    }
    if (patch.mdColumns !== undefined) {
      const fitted = fitToColumns(tabletRects(origin), mdColumnsOf(draft))
      for (const w of draft.widgets) {
        const rect = fitted.get(w.id)
        if (rect) w.layout = { ...w.layout, md: rect }
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
      layout: layoutForNewWidget(draft, s.bp, rect)
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
      layout: layoutForNewWidget(draft, s.bp, rect)
    })
  })
  useEditorStore.setState({ selectedIds: [id], panelOpen: true, paletteOpen: false, placing: null })
  return true
}

export function removeWidget(id: string, opts?: RemoveOptions): void {
  removeWidgets([id], opts)
}

export interface RemoveOptions {
  /** take it off every layout, whatever is being edited. Cut means move, so it uses this. */
  everywhere?: boolean
}

export function removeWidgets(ids: string[], opts: RemoveOptions = {}): void {
  if (ids.length === 0) return
  const s = useEditorStore.getState()
  const draft = s.draft
  if (!draft) return

  const present = new Set(draft.widgets.map((w) => w.id))
  const plan = opts.everywhere
    ? { deleted: ids.filter((id) => present.has(id)), hidden: [], scope: surfacesOf(s.bp), kept: [] as Surface[] }
    : planRemoval(draft, ids, s.bp)
  // nothing matched: a toast promising something happened, and an undo entry for no change, are
  // both worse than doing nothing
  if (plan.deleted.length === 0 && plan.hidden.length === 0) return

  const drop = new Set(plan.deleted)
  const hide = new Set(plan.hidden)
  applyChange((next) => {
    for (const w of next.widgets) {
      if (hide.has(w.id)) w.config = { ...w.config, hideOn: hiddenAfterRemoval(w, plan.scope) }
    }
    next.widgets = next.widgets.filter((w) => !drop.has(w.id))
    // a widget only hidden somewhere still has a place in the stack, so its order is left alone
    if (next.stackOrder) next.stackOrder = next.stackOrder.filter((w) => !drop.has(w))
  })
  useEditorStore.setState((cur) => ({ selectedIds: cur.selectedIds.filter((w) => !drop.has(w) && !hide.has(w)) }))

  if (plan.hidden.length > 0) {
    notify(
      plan.scope.includes('tablet')
        ? i18n.t('Removed from the tablet layout. Still on the desktop layout.')
        : i18n.t('Removed from the desktop layout. Still on the tablet layout.'),
      { action: { label: i18n.t('Remove everywhere'), run: () => removeWidgets(plan.hidden, { everywhere: true }) } }
    )
  }
}

/** put a widget back on the layout being edited, which is what undoes a scoped delete */
export function showWidgetHere(id: string): void {
  const bp = useEditorStore.getState().bp
  applyChange((draft) => {
    const widget = draft.widgets.find((w) => w.id === id)
    if (!widget) return
    const left = hiddenAfterShowing(widget, surfacesOf(bp))
    widget.config = { ...widget.config, hideOn: left.length > 0 ? left : undefined }
  })
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
      draft.widgets.push({ id, type: item.type, config: clone(item.config), layout: layoutForNewWidget(draft, bp, rect) })
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

export function clearTabletLayout(): void {
  // A widget taken off the desktop layout is hidden on the desktop and the phone and kept for the
  // tablet one. Take the tablet layout away and it has nowhere left to draw: it still exists, still
  // has to be found in the editor, and renders on no screen. Same rule as the scoped delete, reached
  // through a different door - a widget is never left showing nowhere, so those come back.
  let restored = 0
  applyChange((draft) => {
    draft.mdColumns = undefined
    for (const w of draft.widgets) {
      if (w.layout.md) {
        const { md: _md, ...rest } = w.layout
        w.layout = rest
      }
      const hidden = hiddenSurfaces(w)
      if (surfacesOf('lg').every((sfc) => hidden.includes(sfc))) {
        restored++
        w.config = { ...w.config, hideOn: undefined }
      }
    }
  })
  useEditorStore.setState({ bp: 'lg' })
  if (restored > 0) notify(i18n.t('{{count}} widgets that were only on the tablet layout are showing again.', { count: restored }))
}

const SIGNIN_DRAFT = 'neohab:signinDraft'
// long enough for a sign-in, short enough that a reload much later does not bring back an old edit
const SIGNIN_DRAFT_MS = 15 * 60_000
let leavingForSignIn = false

/** the openHAB login page is another page, so the draft goes through it in this tab's session storage */
export function keepDraftThroughSignIn(): boolean {
  const draft = useEditorStore.getState().draft
  if (!draft) return false
  try {
    sessionStorage.setItem(SIGNIN_DRAFT, JSON.stringify({ at: Date.now(), draft }))
  } catch {
    return false
  }
  leavingForSignIn = true
  return true
}

// the draft is safe, so the unsaved-changes guard has nothing to protect on the way to the login page
export function isLeavingForSignIn(): boolean {
  return leavingForSignIn
}

// the redirect never happened, so the draft is still here and the guard is needed again
export function dropDraftKeptThroughSignIn(): void {
  leavingForSignIn = false
  try {
    sessionStorage.removeItem(SIGNIN_DRAFT)
  } catch {
    // nothing kept, nothing to drop
  }
}

/** the draft kept for this dashboard, handed out once; one kept for another dashboard waits for that one */
export function takeDraftKeptThroughSignIn(id: string): Dashboard | null {
  try {
    const raw = sessionStorage.getItem(SIGNIN_DRAFT)
    if (!raw) return null
    let kept: { at?: unknown; draft?: Dashboard } | null = null
    try {
      kept = JSON.parse(raw) as { at?: unknown; draft?: Dashboard }
    } catch {
      kept = null
    }
    const usable =
      kept !== null && typeof kept.at === 'number' && Date.now() - kept.at <= SIGNIN_DRAFT_MS && Array.isArray(kept.draft?.widgets)
    if (usable && kept!.draft!.id !== id) return null
    sessionStorage.removeItem(SIGNIN_DRAFT)
    return usable ? kept!.draft! : null
  } catch {
    return null
  }
}

export function resumeDraft(saved: Dashboard, draft: Dashboard): void {
  startEditing(saved)
  useEditorStore.setState({ draft: clone(draft), dirty: true })
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
