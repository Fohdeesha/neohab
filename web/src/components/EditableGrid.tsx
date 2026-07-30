/**
 * Edit-mode grid: same geometry as the runtime Grid, plus selection, drag (via the handle
 * strip), and resize (corner handle) using pointer events - one code path for mouse and touch.
 *
 * Interaction model: the dragged widget follows the pointer with a CSS transform while a
 * placeholder shows the snapped target cell; green = free, red = occupied. Dropping on an
 * occupied spot reverts, unless the drag has *dwelled* there long enough to arm a bump - see
 * BUMP_DWELL_MS. Grid layout edits need the full grid, so they require a wide viewport; narrow
 * screens edit the single-column stack instead (settings, add/remove, drag-to-reorder — see
 * StackedEditGrid).
 *
 * Selection: a plain click selects one widget (opening its settings); Ctrl/Cmd-click toggles a
 * widget in/out of a multi-selection and Shift-click adds to it; touch long-press starts a
 * multi-selection; and a mouse drag from ANYWHERE that is not a handle — widget bodies included,
 * because a dense dashboard has next to no bare background — draws a rubber-band box selecting
 * everything it touches (widgets move only by their handle strip, so a body-drag is unambiguous).
 * A multi-selection drives batch copy/cut/delete from the toolbar (see DashboardView).
 */
import { useEffect, useRef, useState } from 'react'
import type { Dashboard, Rect } from '../model/dashboard'
import {
  cellMetrics,
  clampRect,
  columnsOf,
  hiddenSurfaces,
  iconScale,
  overlapsAny,
  planBump,
  projectDashboard,
  rectOf,
  textScale,
  widgetLabelAlign,
  widgetLabelBottom,
  widgetTextScale,
  type BumpPlan,
} from '../model/layout'
import {
  addToSelection,
  addWidgetAt,
  cancelPlacing,
  clearSelection,
  selectWidget,
  setSelection,
  setWidgetRect,
  toggleWidgetSelection,
  useEditorStore,
} from '../store/editor'
import { CellHandle } from './CellHandle'
import { WidgetHost } from './WidgetHost'
import { StackedEditGrid } from './StackedEditGrid'
import { useContainerWidth } from './useContainerWidth'
import { useGridEditSurface } from './useEditSurface'

/**
 * How long a move must rest on an occupied target before the widgets there are bumped aside.
 * Dragging across the grid crosses plenty of widgets on the way; only stopping on one means it.
 */
const BUMP_DWELL_MS = 400

/** Touch hold that starts a multi-selection. */
const LONG_PRESS_MS = 500

interface DragState {
  id: string
  mode: 'move' | 'resize'
  startRect: Rect
  startX: number
  startY: number
  /** Live pixel offset applied to the dragged widget. */
  dx: number
  dy: number
  /** Snapped target rect + validity, shown as the placeholder. */
  target: Rect
  valid: boolean
  /** Armed bump: where the widgets in the way go if this drop lands. Null until the dwell. */
  bump: BumpPlan | null
}

/** Rubber-band selection box, in container-local pixels. Exists only once the pointer has
 * moved past MARQUEE_THRESHOLD_PX — before that the press is a potential click (see pending). */
interface MarqueeState {
  startX: number
  startY: number
  curX: number
  curY: number
  /** Shift/Ctrl/Cmd held at the start: add the enclosed widgets to the existing selection. */
  additive: boolean
}

/**
 * A mouse press that may become either a click (selection) or a marquee (if it moves). Held in
 * a ref, not state: it changes on pointer events that must not re-render the grid.
 */
interface PendingMarquee {
  clientX: number
  clientY: number
  additive: boolean
  /** Started on a widget overlay (vs bare grid background). A bare-background click clears the
   * selection; a widget click's selection is handled by the overlay's own click handler. */
  fromWidget: boolean
}

/** Movement past this many pixels turns a press into a marquee instead of a click. */
const MARQUEE_THRESHOLD_PX = 5

const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/** Pixel bounding box (left/top/right/bottom) of a grid rect at the given cell metrics. */
function pixelBox(r: Rect, colWidth: number, rowHeight: number, gap: number) {
  const left = r.x * (colWidth + gap)
  const top = r.y * (rowHeight + gap)
  return { left, top, right: left + r.w * colWidth + (r.w - 1) * gap, bottom: top + r.h * rowHeight + (r.h - 1) * gap }
}

function boxesOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

export function EditableGrid({ dashboard: draft }: { dashboard: Dashboard }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const bp = useEditorStore((s) => s.bp)
  const placing = useEditorStore((s) => s.placing)
  // Editing the tablet layout works on the projection: that breakpoint's rects and column count
  // sit in the lg slots, so the drag, bump and free-spot maths below need no special case. The
  // store writes every rect back into the breakpoint it came from.
  const dashboard = projectDashboard(draft, bp)
  const [placeTarget, setPlaceTarget] = useState<{ rect: Rect; valid: boolean } | null>(null)
  const containerWidth = useContainerWidth(containerRef)
  const gridSurface = useGridEditSurface()
  const dwellRef = useRef<number | null>(null)
  // Touch long-press → multi-select. One press at a time; the ref survives re-renders.
  const longPressRef = useRef<number | null>(null)
  const longPressStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  // A mouse press that may become a click or a marquee, depending on movement. Must be
  // declared with the other hooks: the stacked-surface early return below skips later code.
  const pendingRef = useRef<PendingMarquee | null>(null)
  // The dwell fires 400ms after the render that armed it, by which time an undo, a redo or a
  // settings edit may have replaced the draft. The plan must be made against the current
  // dashboard, not the one that was on screen when the pointer stopped moving.
  const dashRef = useRef(dashboard)
  dashRef.current = dashboard
  const { gap, colWidth, rowHeight } = cellMetrics(dashboard, containerWidth)

  const clearDwell = () => {
    if (dwellRef.current !== null) {
      window.clearTimeout(dwellRef.current)
      dwellRef.current = null
    }
  }
  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
    longPressStart.current = null
  }
  useEffect(() => () => {
    clearDwell()
    clearLongPress()
  }, [])

  /**
   * Palette drag-to-place. The press began on a palette card, so those pointer events are not
   * ours: follow them at window level, preview the drop cell, and place on release. A release
   * outside the grid (or on an occupied cell) cancels instead of guessing a spot.
   */
  useEffect(() => {
    if (!placing) {
      setPlaceTarget(null)
      return
    }
    const targetFor = (clientX: number, clientY: number): { rect: Rect; valid: boolean } | null => {
      const el = containerRef.current
      if (!el) return null
      const box = el.getBoundingClientRect()
      if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null
      const m = cellMetrics(dashRef.current, el.clientWidth)
      const rect = clampRect(
        {
          x: Math.floor((clientX - box.left) / (m.colWidth + m.gap)),
          y: Math.floor((clientY - box.top) / (m.rowHeight + m.gap)),
          w: placing.w,
          h: placing.h,
        },
        columnsOf(dashRef.current)
      )
      return { rect, valid: !overlapsAny(dashRef.current, rect) }
    }
    const onMove = (e: PointerEvent) => setPlaceTarget(targetFor(e.clientX, e.clientY))
    const onUp = (e: PointerEvent) => {
      const hit = targetFor(e.clientX, e.clientY)
      if (hit?.valid) addWidgetAt(hit.rect)
      else cancelPlacing()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancelPlacing)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancelPlacing)
    }
  }, [placing])

  if (gridSurface !== true) {
    // The phone surface edits the stack itself (and its order), which has no breakpoints.
    // Phones edit the stack they actually see: reorder + settings, not grid geometry.
    // (See useEditSurface for why this is keyed on the viewport rather than the container.)
    return <StackedEditGrid dashboard={draft} />
  }

  /** Pixel size of one grid cell (content, excluding gap), measured live. */
  const cellSize = (): { w: number; h: number } => {
    const el = containerRef.current
    const m = cellMetrics(dashboard, el ? el.clientWidth : 0)
    return { w: m.colWidth, h: m.rowHeight }
  }

  const beginDrag = (id: string, mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const widget = dashboard.widgets.find((w) => w.id === id)
    if (!widget) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // Selection waits for the drop: selecting opens the settings panel, which takes 340px off
    // the surface and re-lays out every cell. Doing that under a live pointer would shrink the
    // grid the drag is being measured against, landing the widget on the wrong column.
    const startRect = rectOf(widget)
    setDrag({
      id,
      mode,
      startRect,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      target: startRect,
      valid: true,
      bump: null,
    })
  }

  /** The dwell elapsed: work out who moves where, and turn the drop green if anyone can. */
  const armBump = () => {
    dwellRef.current = null
    setDrag((d) => {
      if (!d || d.mode !== 'move') return d
      const plan = planBump(dashRef.current, d.id, d.target)
      if (!plan || plan.size === 0) return d
      return { ...d, bump: plan, valid: true }
    })
  }

  /* -------------------------------- selection (per widget) -------------------------------- */

  const onWidgetClick = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    if (suppressClickRef.current) {
      suppressClickRef.current = false // a long-press or marquee already handled this press
      return
    }
    if (e.ctrlKey || e.metaKey) toggleWidgetSelection(id)
    else if (e.shiftKey) addToSelection(id)
    else selectWidget(id)
  }

  const onWidgetPointerDown = (id: string) => (e: React.PointerEvent) => {
    suppressClickRef.current = false // clear any stale flag from a press whose click never fired
    if (e.pointerType === 'mouse') {
      // A mouse press on a widget body is a potential marquee start (widgets only move by
      // their handle, so a body-drag is unambiguous — and dense dashboards have no bare
      // background to start one from). No movement = a normal click, handled by onWidgetClick.
      if (e.button === 0) {
        pendingRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
          fromWidget: true,
        }
      }
      return
    }
    clearLongPress()
    longPressStart.current = { x: e.clientX, y: e.clientY }
    longPressRef.current = window.setTimeout(() => {
      suppressClickRef.current = true
      toggleWidgetSelection(id)
      navigator.vibrate?.(10)
    }, LONG_PRESS_MS)
  }

  const onWidgetPointerMove = (e: React.PointerEvent) => {
    const start = longPressStart.current
    if (!start) return
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) clearLongPress()
  }

  /* ------------------------------------- marquee ------------------------------------- */

  const toLocal = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(clientY - rect.top, rect.height)),
    }
  }

  const onGridPointerDown = (e: React.PointerEvent) => {
    // A press on the bare grid background (cells stop propagation of their own paths: handle,
    // resize and delete all stopPropagation; the overlay records its own pending above).
    if (e.target !== containerRef.current) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    pendingRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      additive: e.shiftKey || e.ctrlKey || e.metaKey,
      fromWidget: false,
    }
  }

  const finishMarquee = (m: MarqueeState) => {
    setMarquee(null)
    const box = {
      left: Math.min(m.startX, m.curX),
      top: Math.min(m.startY, m.curY),
      right: Math.max(m.startX, m.curX),
      bottom: Math.max(m.startY, m.curY),
    }
    const hit = dashboard.widgets
      .filter((w) => boxesOverlap(pixelBox(rectOf(w), colWidth, rowHeight, gap), box))
      .map((w) => w.id)
    const current = useEditorStore.getState().selectedIds
    setSelection(m.additive ? [...new Set([...current, ...hit])] : hit)
  }

  /* --------------------------------- unified pointer flow --------------------------------- */

  const onPointerMove = (e: React.PointerEvent) => {
    // Promote a pending press to a marquee once it has clearly moved (and is not a drag).
    const pend = pendingRef.current
    if (pend && !marquee && !drag) {
      if (
        Math.abs(e.clientX - pend.clientX) > MARQUEE_THRESHOLD_PX ||
        Math.abs(e.clientY - pend.clientY) > MARQUEE_THRESHOLD_PX
      ) {
        pendingRef.current = null
        containerRef.current?.setPointerCapture(e.pointerId)
        const s = toLocal(pend.clientX, pend.clientY)
        const c = toLocal(e.clientX, e.clientY)
        setMarquee({ startX: s.x, startY: s.y, curX: c.x, curY: c.y, additive: pend.additive })
      }
      return
    }
    if (marquee) {
      const p = toLocal(e.clientX, e.clientY)
      setMarquee({ ...marquee, curX: p.x, curY: p.y })
      return
    }
    if (!drag) return
    const { w: cw, h: ch } = cellSize()
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const cellsX = Math.round(dx / (cw + gap))
    const cellsY = Math.round(dy / (ch + gap))

    // Everything the target derives from is fixed for the life of the drag, so the captured
    // `drag` is safe to read here even if a render is pending.
    const target = clampRect(
      drag.mode === 'move'
        ? { ...drag.startRect, x: drag.startRect.x + cellsX, y: drag.startRect.y + cellsY }
        : { ...drag.startRect, w: drag.startRect.w + cellsX, h: drag.startRect.h + cellsY },
      columnsOf(dashboard)
    )
    const overlaps = overlapsAny(dashboard, target, drag.id)

    // The dwell timer runs per target cell: moving to a new occupied cell restarts it, holding
    // still leaves it running, and it never starts where there is nothing to bump.
    if (!sameRect(target, drag.target)) {
      clearDwell()
      if (drag.mode === 'move' && overlaps) dwellRef.current = window.setTimeout(armBump, BUMP_DWELL_MS)
    }
    // An armed bump belongs to the cell it was planned for, so leaving that cell drops it.
    // Compared against the live state, not the captured one: the timer may have armed a bump
    // between this event and the last render, and that must not be thrown away.
    setDrag((d) => {
      if (!d) return d
      const bump = sameRect(target, d.target) ? d.bump : null
      return { ...d, dx, dy, target, valid: !overlaps || !!bump, bump }
    })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const pend = pendingRef.current
    pendingRef.current = null
    if (marquee) {
      finishMarquee(marquee)
      // A release over the widget the marquee started on still fires a click there; that click
      // must not replace the selection the marquee just made. Cleared on the next tick so a
      // stale flag can never swallow a later, unrelated click.
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      return
    }
    if (pend && !pend.fromWidget) {
      // A bare click on empty background clears the selection (modifier held = keep adding).
      if (!pend.additive) clearSelection()
      return
    }
    clearDwell()
    if (!drag) return
    if (drag.valid) setWidgetRect(drag.id, drag.target, drag.bump ?? undefined)
    // Selection on drop. A no-move press on the handle strip is just a click on the widget, so
    // it behaves exactly like a body click — Ctrl toggles, Shift adds, plain replace-selects
    // (even out of a multi-selection: a bare click always means "just this one"). Only a real
    // move preserves an existing multi-selection the dragged widget belongs to; otherwise the
    // drop selects the moved widget (opening its settings panel).
    const clickLike =
      Math.abs(e.clientX - drag.startX) <= MARQUEE_THRESHOLD_PX &&
      Math.abs(e.clientY - drag.startY) <= MARQUEE_THRESHOLD_PX
    if (clickLike && (e.ctrlKey || e.metaKey)) toggleWidgetSelection(drag.id)
    else if (clickLike && e.shiftKey) addToSelection(drag.id)
    else if (clickLike) selectWidget(drag.id)
    else {
      const sel = useEditorStore.getState().selectedIds
      if (!(sel.length > 1 && sel.includes(drag.id))) selectWidget(drag.id)
    }
    setDrag(null)
  }

  const cancelPointer = () => {
    clearDwell()
    pendingRef.current = null
    setDrag(null)
    setMarquee(null)
  }

  if (containerWidth === 0) {
    // First paint: width unknown, render the container alone and lay out next frame.
    return <div ref={containerRef} className="nh-grid nh-grid--edit" />
  }

  return (
    <div
      ref={containerRef}
      className="nh-grid nh-grid--edit"
      style={
        {
          gridTemplateColumns: `repeat(${columnsOf(dashboard)}, 1fr)`,
          gridAutoRows: `${rowHeight}px`,
          gap,
          '--nh-iconscale': iconScale(dashboard, rowHeight),
          '--nh-textscale': textScale(dashboard, rowHeight),
        } as React.CSSProperties
      }
      onPointerDown={onGridPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelPointer}
    >
      {/* placeholder for the snapped drop target */}
      {drag ? (
        <div
          className={'nh-drop' + (drag.valid ? '' : ' nh-drop--invalid')}
          style={{
            gridColumn: `${drag.target.x + 1} / span ${drag.target.w}`,
            gridRow: `${drag.target.y + 1} / span ${drag.target.h}`,
          }}
        />
      ) : null}

      {/* palette drag-to-place preview: where the new widget would land */}
      {placeTarget ? (
        <div
          className={'nh-drop nh-drop--place' + (placeTarget.valid ? '' : ' nh-drop--invalid')}
          style={{
            gridColumn: `${placeTarget.rect.x + 1} / span ${placeTarget.rect.w}`,
            gridRow: `${placeTarget.rect.y + 1} / span ${placeTarget.rect.h}`,
          }}
        >
          <span className="nh-drop__label">{placing?.name}</span>
        </div>
      ) : null}

      {/* rubber-band selection box */}
      {marquee ? (
        <div
          className="nh-marquee"
          style={{
            left: Math.min(marquee.startX, marquee.curX),
            top: Math.min(marquee.startY, marquee.curY),
            width: Math.abs(marquee.curX - marquee.startX),
            height: Math.abs(marquee.curY - marquee.startY),
          }}
        />
      ) : null}

      {dashboard.widgets.map((widget) => {
        // An armed bump previews itself: the widgets it moves render where the drop puts them.
        const bumpedTo = drag?.bump?.get(widget.id)
        const r = bumpedTo ?? rectOf(widget)
        const isDragging = drag?.id === widget.id
        const isSelected = selectedIds.includes(widget.id)
        // A widget hidden somewhere still has to be visible HERE, or there would be no way to
        // select it and un-hide it. Dimmed, with the surfaces it is hidden on named on the handle.
        const hiddenOn = hiddenSurfaces(widget)
        return (
          <div
            key={widget.id}
            className={
              'nh-cell' +
              (isSelected ? ' nh-cell--selected' : '') +
              (isDragging ? ' nh-cell--dragging' : '') +
              (bumpedTo ? ' nh-cell--bumped' : '') +
              (hiddenOn.length > 0 ? ' nh-cell--hidden' : '') +
              (widgetLabelBottom(widget) ? ' nh-labelbottom' : '')
            }
            style={
              {
                gridColumn: `${r.x + 1} / span ${r.w}`,
                gridRow: `${r.y + 1} / span ${r.h}`,
                minWidth: 0,
                minHeight: 0,
                '--nh-widgetscale': widgetTextScale(widget),
                '--nh-labelalign': widgetLabelAlign(widget),
                // A move follows the pointer; a resize stretches the box in place (its top-left
                // is anchored) while the placeholder shows the snapped result.
                transform: isDragging && drag.mode === 'move' ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                width: isDragging && drag.mode === 'resize' ? `max(40px, calc(100% + ${drag.dx}px))` : undefined,
                height: isDragging && drag.mode === 'resize' ? `max(40px, calc(100% + ${drag.dy}px))` : undefined,
              } as React.CSSProperties
            }
          >
            <WidgetHost instance={widget} editing />

            {/* edit overlay: tap selects, handle strip drags, corner resizes */}
            <div
              className="nh-cell__overlay"
              onClick={onWidgetClick(widget.id)}
              onPointerDown={onWidgetPointerDown(widget.id)}
              onPointerMove={onWidgetPointerMove}
              onPointerUp={clearLongPress}
              onPointerCancel={clearLongPress}
            />
            <CellHandle
              id={widget.id}
              type={widget.type}
              hiddenOn={hiddenOn}
              onDragStart={beginDrag(widget.id, 'move')}
            />
            <div className="nh-cell__resize" onPointerDown={beginDrag(widget.id, 'resize')} />
          </div>
        )
      })}
    </div>
  )
}
