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
import { LIFT_SLOP_PX, LONG_PRESS_MS } from './useLongPress'
import { WidgetHost } from './WidgetHost'
import { createEdgeScroll } from './edgeScroll'

interface DragState {
  id: string
  /** every row moving: the one under the pointer, and the rest of the selection when it is part of one */
  group: Set<string>
  startY: number
  /** window.scrollY when the drag began; the page can scroll under a still finger */
  startScroll: number
  /** picked up by a touch hold rather than the handle, so letting go never counts as a tap */
  lifted: boolean
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
  // a touch held still: the row is up and follows the finger once it moves
  const liftRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const lastY = useRef<number | null>(null)
  const moveRef = useRef<(clientY: number) => void>(() => {})
  const edgeScroll = useRef(
    createEdgeScroll(() => {
      if (lastY.current !== null) moveRef.current(lastY.current)
    })
  )

  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    longPressStart.current = null
  }
  const endLift = () => {
    liftRef.current = null
    setLifted(null)
  }
  // a press interrupted by an unmount would otherwise fire its hold into an editor that is gone
  useEffect(
    () => () => {
      clearLongPress()
      edgeScroll.current.stop()
    },
    []
  )

  // see EditableGrid: a quick swipe scrolls, a lifted row keeps the rest of its touch
  const measured = width > 0
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (liftRef.current || dragRef.current) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [measured])

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
    endLift()
    const start = { x: e.clientX, y: e.clientY }
    longPressStart.current = start
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null
      liftRow(id, start)
    }, LONG_PRESS_MS)
  }

  // held still: the row comes up. Moving drags it; letting go selects it for a multi-selection.
  const liftRow = (id: string, at: { x: number; y: number }) => {
    suppressClickRef.current = true
    liftRef.current = { id, ...at }
    setLifted(id)
    navigator.vibrate?.(10)
  }

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const lift = liftRef.current
    if (lift) {
      if (dragRef.current) return
      if (Math.abs(e.clientX - lift.x) <= LIFT_SLOP_PX && Math.abs(e.clientY - lift.y) <= LIFT_SLOP_PX) return
      setDrag(dragFrom(lift.id, lift.y, true))
      return
    }
    const start = longPressStart.current
    if (!start) return
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) clearLongPress()
  }

  const onOverlayPointerUp = () => {
    const lift = liftRef.current
    clearLongPress()
    if (!lift) return
    endLift()
    if (!dragRef.current) toggleWidgetSelection(lift.id)
  }

  const onOverlayPointerCancel = () => {
    clearLongPress()
    endLift()
  }

  // Android's own long press raises contextmenu, possibly before the timer; it means the same thing
  const onOverlayContextMenu = (id: string) => (e: React.MouseEvent) => {
    const start = longPressStart.current
    if (!start && !liftRef.current) return
    e.preventDefault()
    if (start && !liftRef.current) {
      clearLongPress()
      longPressStart.current = start
      liftRow(id, start)
    }
  }

  const insertPosFor = (clientY: number, group: Set<string>): number => {
    let pos = 0
    for (const w of ordered) {
      if (group.has(w.id)) continue
      const el = rowRefs.current.get(w.id)
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientY > r.top + r.height / 2) pos++
    }
    return pos
  }

  const dragFrom = (id: string, y: number, lifted: boolean): DragState => {
    const sel = useEditorStore.getState().selectedIds
    const group = new Set(sel.length > 1 && sel.includes(id) ? sel : [id])
    return { id, group, startY: y, startScroll: window.scrollY, lifted, dy: 0, insertPos: insertPosFor(y, group) }
  }

  const beginDrag = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag(dragFrom(id, e.clientY, false))
  }

  // also run by the edge scroll with the last pointer position, after the page has moved under it
  const moveDrag = (clientY: number) => {
    const d = dragRef.current
    if (!d) return
    setDrag({ ...d, dy: clientY - d.startY + window.scrollY - d.startScroll, insertPos: insertPosFor(clientY, d.group) })
  }
  moveRef.current = moveDrag

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    lastY.current = e.clientY
    moveDrag(e.clientY)
    edgeScroll.current.track(e.clientY)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    edgeScroll.current.stop()
    if (!drag) return
    setDrag(null)
    // a tap on the handle opens the settings; a real drag leaves the selection and the panel as they were
    const clickLike = !drag.lifted && Math.abs(drag.dy) <= 5
    if (clickLike && (e.ctrlKey || e.metaKey)) toggleWidgetSelection(drag.id)
    else if (clickLike && e.shiftKey) addToSelection(drag.id)
    else if (clickLike) selectWidget(drag.id)
    // a selection lands together, in the order it already had
    const ids = ordered.filter((w) => !drag.group.has(w.id)).map((w) => w.id)
    ids.splice(drag.insertPos, 0, ...ordered.filter((w) => drag.group.has(w.id)).map((w) => w.id))
    if (ids.join('\n') === ordered.map((w) => w.id).join('\n')) return // dropped where it was; no undo entry
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
      onPointerCancel={() => {
        edgeScroll.current.stop()
        setDrag(null)
      }}>
      {ordered.map((widget) => {
        const min = instanceMinHeight(widget.type, widget.config)
        const height = stackedCellHeight(dashboard, rectOf(widget), width, min, instanceFixedShape(widget.type))
        const isDragging = drag?.group.has(widget.id) === true
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
                (lifted === widget.id && !isDragging ? ' nh-cell--lifted' : '') +
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
                onPointerUp={onOverlayPointerUp}
                onPointerCancel={onOverlayPointerCancel}
                onContextMenu={onOverlayContextMenu(widget.id)}
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
