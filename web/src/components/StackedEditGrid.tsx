/**
 * Narrow-viewport (phone) edit surface: the same single-column stack as the runtime grid,
 * with drag-to-reorder via each widget's handle. The first reorder pins an explicit
 * stackOrder on the dashboard; until then the stack follows the grid's row order. Widget
 * position/size on the wide grid is still edited on a wide viewport - here the handle only
 * moves widgets up and down, with a line showing where the drop lands.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Dashboard } from '../model/dashboard'
import {
  cellMetrics,
  gapOf,
  hiddenSurfaces,
  iconScale,
  rectOf,
  stackedOrder,
  stackedTextScale,
  widgetAccent,
  widgetAccentColor,
  widgetAccentInk,
  widgetLabelAlign,
  widgetLabelBottom,
  widgetTextScale,
  STACK_REFERENCE_WIDTH,
} from '../model/layout'
import { instanceMinHeight } from '../widgets/registry'
import {
  addToSelection,
  selectWidget,
  toggleWidgetSelection,
  updateDashboardMeta,
  useEditorStore,
} from '../store/editor'
import { CellHandle } from './CellHandle'
import { useCoarsePointer } from './useCoarsePointer'
import { WidgetHost } from './WidgetHost'

/** Touch hold that starts a multi-selection (mirrors the wide grid). */
const LONG_PRESS_MS = 500

interface DragState {
  id: string
  startY: number
  dy: number
  /** Insertion position among the non-dragged rows. */
  insertPos: number
}

export function StackedEditGrid({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const ordered = stackedOrder(dashboard)
  const unit = cellMetrics(dashboard, STACK_REFERENCE_WIDTH).rowHeight
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const [drag, setDrag] = useState<DragState | null>(null)
  // The text-scale floor is the device's as well as the row's (see textFloor).
  const coarse = useCoarsePointer()
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  // Touch long-press → multi-select, matching the wide grid.
  const longPressRef = useRef<number | null>(null)
  const longPressStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    longPressStart.current = null
  }
  // A press interrupted by an unmount - a route change, Save, or the viewport crossing back over
  // STACK_BELOW - would otherwise fire its long-press into an editor that is no longer there.
  // The wide grid does the same; the two surfaces are deliberately kept in step.
  useEffect(() => () => clearLongPress(), [])

  const onOverlayClick = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (e.ctrlKey || e.metaKey) toggleWidgetSelection(id)
    else if (e.shiftKey) addToSelection(id)
    else selectWidget(id)
  }

  const onOverlayPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return
    suppressClickRef.current = false // clear any stale flag from a press whose click never fired
    clearLongPress()
    longPressStart.current = { x: e.clientX, y: e.clientY }
    longPressRef.current = window.setTimeout(() => {
      suppressClickRef.current = true
      toggleWidgetSelection(id)
      navigator.vibrate?.(10)
    }, LONG_PRESS_MS)
  }

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const start = longPressStart.current
    if (!start) return
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) clearLongPress()
  }

  /** How many non-dragged rows the pointer is below (midpoint rule) = insertion position. */
  const insertPosFor = (clientY: number, dragId: string): number => {
    let pos = 0
    for (const w of ordered) {
      if (w.id === dragId) continue
      const el = rowRefs.current.get(w.id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientY > r.top + r.height / 2) pos++
    }
    return pos
  }

  const beginDrag = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // Selection waits for the drop, as on the wide grid: opening the settings sheet over the
    // stack mid-drag would cover the rows being dragged between.
    setDrag({ id, startY: e.clientY, dy: 0, insertPos: insertPosFor(e.clientY, id) })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    setDrag({ ...drag, dy: e.clientY - drag.startY, insertPos: insertPosFor(e.clientY, drag.id) })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return
    const from = ordered.findIndex((w) => w.id === drag.id)
    setDrag(null)
    // Selection on drop: a no-move press on the handle is a click on the widget, so it behaves
    // exactly like a body click (Ctrl toggles, Shift adds, plain replace-selects - matching the
    // wide grid). A real reorder keeps a multi-selection intact when the widget belongs to it.
    const clickLike = Math.abs(drag.dy) <= 5
    if (clickLike && (e.ctrlKey || e.metaKey)) toggleWidgetSelection(drag.id)
    else if (clickLike && e.shiftKey) addToSelection(drag.id)
    else if (clickLike) selectWidget(drag.id)
    else {
      const sel = useEditorStore.getState().selectedIds
      if (!(sel.length > 1 && sel.includes(drag.id))) selectWidget(drag.id)
    }
    if (drag.insertPos === from) return // dropped where it was; no undo entry
    const ids = ordered.filter((w) => w.id !== drag.id).map((w) => w.id)
    ids.splice(drag.insertPos, 0, drag.id)
    updateDashboardMeta({ stackOrder: ids })
  }

  // Drop indicator: rendered before the insertPos-th non-dragged row (or after the last).
  let nonDragged = 0

  return (
    <div
      className="nh-grid nh-grid--stacked nh-grid--stackedit"
      style={
        {
          gap: gapOf(dashboard),
          '--nh-iconscale': iconScale(dashboard, unit),
        } as React.CSSProperties
      }
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {ordered.map((widget) => {
        const min = instanceMinHeight(widget.type, widget.config)
        const height = Math.round(Math.max(rectOf(widget).h * unit, min))
        const isDragging = drag?.id === widget.id
        const indicator = drag && !isDragging && nonDragged++ === drag.insertPos
        return (
          <div key={widget.id} style={{ display: 'contents' }}>
            {indicator ? <div className="nh-stackdrop" /> : null}
            <div
              ref={(el) => {
                if (el) rowRefs.current.set(widget.id, el)
                else rowRefs.current.delete(widget.id)
              }}
              className={
                'nh-cell' +
                (selectedIds.includes(widget.id) ? ' nh-cell--selected' : '') +
                (isDragging ? ' nh-cell--dragging' : '') +
                (hiddenSurfaces(widget).length > 0 ? ' nh-cell--hidden' : '') +
                (widgetLabelBottom(widget) ? ' nh-labelbottom' : '') +
                (widgetAccent(widget) ? ` nh-acc-${widgetAccent(widget)}` : '')
              }
              style={
                {
                  height,
                  '--nh-textscale': stackedTextScale(dashboard, unit, height, coarse),
                  '--nh-widgetscale': widgetTextScale(widget),
                  '--nh-labelalign': widgetLabelAlign(widget),
                  '--nh-cellaccent': widgetAccentColor(widget),
                  '--nh-accent-ink': widgetAccentInk(widget),
                  transform: isDragging ? `translateY(${drag.dy}px)` : undefined,
                } as React.CSSProperties
              }
            >
              <WidgetHost instance={widget} editing />
              {/* a real button, matching the wide grid: Tab reaches every widget, Enter selects */}
              <button
                type="button"
                className="nh-cell__overlay"
                aria-label={t('{{type}} widget', { type: widget.type })}
                aria-pressed={selectedIds.includes(widget.id)}
                onClick={onOverlayClick(widget.id)}
                onPointerDown={onOverlayPointerDown(widget.id)}
                onPointerMove={onOverlayPointerMove}
                onPointerUp={clearLongPress}
                onPointerCancel={clearLongPress}
              />
              <CellHandle
                id={widget.id}
                type={widget.type}
                hiddenOn={hiddenSurfaces(widget)}
                onDragStart={beginDrag(widget.id)}
              />
            </div>
          </div>
        )
      })}
      {drag && drag.insertPos === nonDragged ? <div className="nh-stackdrop" /> : null}
    </div>
  )
}
