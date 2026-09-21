import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Dashboard } from '../model/dashboard'
import {
  cellMetrics,
  gapOf,
  hasTabletLayout,
  hiddenSurfaces,
  iconScale,
  rectOf,
  surfacesOf,
  stackedCellHeight,
  stackedOrder,
  stackedTextScale,
  widgetAccent,
  widgetAccentColor,
  widgetAccentInk,
  widgetLabelAlign,
  widgetLabelBottom,
  widgetTextScale,
  STACK_REFERENCE_WIDTH
} from '../model/layout'
import { instanceFixedShape, instanceMinHeight } from '../widgets/registry'
import { addToSelection, selectWidget, toggleWidgetSelection, updateDashboardMeta, useEditorStore } from '../store/editor'
import { CellHandle } from './CellHandle'
import { useCoarsePointer } from './useCoarsePointer'
import { useContainerWidth } from './useContainerWidth'
import { WidgetHost } from './WidgetHost'

const LONG_PRESS_MS = 500

interface DragState {
  id: string
  startY: number
  dy: number
  insertPos: number
}

export function StackedEditGrid({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const ordered = stackedOrder(dashboard)
  const unit = cellMetrics(dashboard, STACK_REFERENCE_WIDTH).rowHeight
  const selectedIds = useEditorStore((s) => s.selectedIds)
  // the stack is the desktop layout reflowed, so this editor is always editing 'lg'
  const editedSurfaces = surfacesOf('lg')
  const scopedDelete = hasTabletLayout(dashboard)
  const [drag, setDrag] = useState<DragState | null>(null)
  const coarse = useCoarsePointer()
  const gridRef = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(gridRef)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
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
  // a press interrupted by an unmount would otherwise fire its hold into an editor that is gone
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

  let nonDragged = 0

  // the measured container stays mounted, like Grid: a cell whose height follows the stacked width
  // would otherwise paint one frame at the wrong size and jump
  if (width === 0) return <div ref={gridRef} className="nh-grid nh-grid--stacked nh-grid--stackedit" />

  return (
    <div
      ref={gridRef}
      className="nh-grid nh-grid--stacked nh-grid--stackedit"
      style={
        {
          gap: gapOf(dashboard),
          '--nh-iconscale': iconScale(dashboard, unit)
        } as React.CSSProperties
      }
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}>
      {ordered.map((widget) => {
        const min = instanceMinHeight(widget.type, widget.config)
        const height = stackedCellHeight(dashboard, rectOf(widget), width, min, instanceFixedShape(widget.type))
        const isDragging = drag?.id === widget.id
        const indicator = drag && !isDragging && nonDragged++ === drag.insertPos
        const hiddenOn = hiddenSurfaces(widget)
        const offHere = editedSurfaces.every((sfc) => hiddenOn.includes(sfc))
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
                (hiddenOn.length > 0 ? ' nh-cell--hidden' : '') +
                (offHere ? ' nh-cell--offhere' : '') +
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
                  transform: isDragging ? `translateY(${drag.dy}px)` : undefined
                } as React.CSSProperties
              }>
              <WidgetHost instance={widget} editing stacked />
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
                hiddenOn={hiddenOn}
                offHere={offHere}
                scoped={scopedDelete}
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
