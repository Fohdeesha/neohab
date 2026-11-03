import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Dashboard, Rect } from '../model/dashboard'
import {
  cellMetrics,
  clampRect,
  collides,
  columnsOf,
  groupFrames,
  hasTabletLayout,
  hiddenSurfaces,
  iconScale,
  overlapsAny,
  planBump,
  planGroupBump,
  projectDashboard,
  rectOf,
  shiftGroup,
  surfacesOf,
  textScale,
  widgetAccent,
  widgetAccentColor,
  widgetAccentInk,
  widgetLabelAlign,
  widgetLabelBottom,
  widgetsOf,
  widgetTextScale,
  type BumpPlan
} from '../model/layout'
import {
  addToSelection,
  addWidgetAt,
  cancelPlacing,
  clearSelection,
  selectWidget,
  setSelection,
  setWidgetRect,
  setWidgetRects,
  toggleWidgetSelection,
  useEditorStore
} from '../store/editor'
import { lookup } from '../model/lookup'
import { CellHandle } from './CellHandle'
import { WidgetHost } from './WidgetHost'
import { StackedEditGrid } from './StackedEditGrid'
import { useCoarsePointer } from './useCoarsePointer'
import { useContainerWidth } from './useContainerWidth'
import { LIFT_SLOP_PX, LONG_PRESS_MS } from './useLongPress'
import { createEdgeScroll } from './edgeScroll'

const BUMP_DWELL_MS = 400

interface DragState {
  /** the widget under the pointer */
  id: string
  mode: 'move' | 'resize'
  /** where everything being moved started: that widget, and the rest of the selection when it is part of one */
  starts: Map<string, Rect>
  startX: number
  startY: number
  /** window.scrollY when the drag began; the page can scroll under a still finger */
  startScroll: number
  /** picked up by a touch hold or by the widget's body rather than the handle, so letting go never counts as a tap */
  lifted: boolean
  dx: number
  dy: number
  targets: Map<string, Rect>
  valid: boolean
  bump: BumpPlan | null
}

interface MarqueeState {
  startX: number
  startY: number
  curX: number
  curY: number
  additive: boolean
}

interface PendingMarquee {
  clientX: number
  clientY: number
  additive: boolean
  fromWidget: boolean
  /** pressed on a widget that is part of a multi-selection: moving drags the selection instead of drawing a box */
  moveId?: string
}

const MARQUEE_THRESHOLD_PX = 5

const ARROW_STEPS: Record<string, { x: number; y: number }> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 }
}

const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

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

export function EditableGrid({ dashboard: draft, gridSurface }: { dashboard: Dashboard; gridSurface: boolean }) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const bp = useEditorStore((s) => s.bp)
  const placing = useEditorStore((s) => s.placing)
  const dashboard = useMemo(() => projectDashboard(draft, bp), [draft, bp])
  const editedSurfaces = surfacesOf(bp)
  // with a second layout in play, Delete takes a widget off the one on screen rather than the board
  const scopedDelete = hasTabletLayout(draft)
  const [placeTarget, setPlaceTarget] = useState<{ rect: Rect; valid: boolean } | null>(null)
  const containerWidth = useContainerWidth(containerRef)
  const coarse = useCoarsePointer()
  const dwellRef = useRef<number | null>(null)
  const longPressRef = useRef<number | null>(null)
  const longPressStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
  // a touch held still: the widget is up and follows the finger once it moves
  const liftRef = useRef<{ id: string; x: number; y: number } | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const moveRef = useRef<(clientX: number, clientY: number) => void>(() => {})
  const edgeScroll = useRef(
    createEdgeScroll(() => {
      const p = lastPointer.current
      if (p) moveRef.current(p.x, p.y)
    })
  )
  // declared up here with the other hooks: the stacked-surface early return below skips later code
  const pendingRef = useRef<PendingMarquee | null>(null)
  // the dwell fires 400ms later, so plan against the current draft rather than the one that was on screen
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
  const endLift = () => {
    liftRef.current = null
    setLifted(null)
  }
  useEffect(
    () => () => {
      clearDwell()
      clearLongPress()
      edgeScroll.current.stop()
    },
    []
  )

  // the overlay leaves touch-action alone so a quick swipe still scrolls the page; once a widget is held up,
  // the rest of that touch is the drag's. Only a listener registered before the touch began can still
  // cancel its moves, and React's own touch listeners are passive.
  const measured = containerWidth > 0
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (liftRef.current || dragRef.current) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [gridSurface, measured])

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
      const k = el.offsetWidth > 0 && box.width > 0 ? box.width / el.offsetWidth : 1
      const rect = clampRect(
        {
          x: Math.floor((clientX - box.left) / k / (m.colWidth + m.gap)),
          y: Math.floor((clientY - box.top) / k / (m.rowHeight + m.gap)),
          w: placing.w,
          h: placing.h
        },
        columnsOf(dashRef.current)
      )
      return { rect, valid: !overlapsAny(dashRef.current, rect) }
    }
    let last: { x: number; y: number } | null = null
    const edge = createEdgeScroll(() => {
      if (last) setPlaceTarget(targetFor(last.x, last.y))
    })
    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY }
      setPlaceTarget(targetFor(e.clientX, e.clientY))
      edge.track(e.clientY)
    }
    const onUp = (e: PointerEvent) => {
      edge.stop()
      const hit = targetFor(e.clientX, e.clientY)
      if (hit?.valid) addWidgetAt(hit.rect)
      else cancelPlacing()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancelPlacing)
    return () => {
      edge.stop()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancelPlacing)
    }
  }, [placing])

  if (gridSurface !== true) {
    // the stack is derived from the desktop layout whichever breakpoint is being edited, but it still
    // goes through the projection so a rect past the column count is clamped exactly as run mode does
    return <StackedEditGrid dashboard={projectDashboard(draft, 'lg')} />
  }

  // pointer coordinates are drawn pixels, everything else is layout pixels; their ratio is the zoom, and 1 when
  // nothing is zoomed
  const pointerScale = (): number => {
    const el = containerRef.current
    if (!el || !el.offsetWidth) return 1
    const drawn = el.getBoundingClientRect().width
    return drawn > 0 ? drawn / el.offsetWidth : 1
  }

  const cellSize = (): { w: number; h: number } => {
    const el = containerRef.current
    const m = cellMetrics(dashboard, el ? el.clientWidth : 0)
    return { w: m.colWidth, h: m.rowHeight }
  }

  // a widget that is part of a multi-selection moves the whole selection; a resize is always the one widget
  const dragFrom = (id: string, mode: 'move' | 'resize', x: number, y: number, lifted: boolean): DragState | null => {
    const all = widgetsOf(dashboard)
    const widget = all.find((w) => w.id === id)
    if (!widget) return null
    const sel = useEditorStore.getState().selectedIds
    const group = mode === 'move' && sel.length > 1 && sel.includes(id) ? all.filter((w) => sel.includes(w.id)) : [widget]
    const starts = new Map(group.map((w) => [w.id, rectOf(w)]))
    return {
      id,
      mode,
      starts,
      startX: x,
      startY: y,
      startScroll: window.scrollY,
      lifted,
      dx: 0,
      dy: 0,
      targets: starts,
      valid: true,
      bump: null
    }
  }

  const beginDrag = (id: string, mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    // selection waits for the drop: opening the panel changes the zoom the drag is measured against
    const next = dragFrom(id, mode, e.clientX, e.clientY, false)
    if (!next) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDrag(next)
  }

  const armBump = () => {
    dwellRef.current = null
    setDrag((d) => {
      if (!d || d.mode !== 'move') return d
      const plan = d.targets.size === 1 ? planBump(dashRef.current, d.id, d.targets.get(d.id)!) : planGroupBump(dashRef.current, d.targets)
      if (!plan || plan.size === 0) return d
      return { ...d, bump: plan, valid: true }
    })
  }

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
      if (e.button === 0) {
        const additive = e.shiftKey || e.ctrlKey || e.metaKey
        const sel = useEditorStore.getState().selectedIds
        pendingRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          additive,
          fromWidget: true,
          moveId: !additive && sel.length > 1 && sel.includes(id) ? id : undefined
        }
      }
      return
    }
    clearLongPress()
    endLift()
    const start = { x: e.clientX, y: e.clientY }
    const overlay = e.currentTarget as HTMLElement
    const pointerId = e.pointerId
    longPressStart.current = start
    longPressRef.current = window.setTimeout(() => {
      longPressRef.current = null
      liftWidget(id, start, overlay, pointerId)
    }, LONG_PRESS_MS)
  }

  // held still for LONG_PRESS_MS: the widget comes up. Moving now drags it; letting go selects it for a
  // multi-selection, which is what a long press did before it could drag.
  const liftWidget = (id: string, at: { x: number; y: number }, overlay: HTMLElement, pointerId: number | null) => {
    suppressClickRef.current = true
    liftRef.current = { id, ...at }
    if (pointerId !== null) {
      try {
        overlay.setPointerCapture(pointerId)
      } catch {
        // the press already ended
      }
    }
    setLifted(id)
    navigator.vibrate?.(10)
  }

  const onWidgetPointerMove = (e: React.PointerEvent) => {
    const lift = liftRef.current
    if (lift) {
      if (dragRef.current) return
      if (Math.abs(e.clientX - lift.x) <= LIFT_SLOP_PX && Math.abs(e.clientY - lift.y) <= LIFT_SLOP_PX) return
      // from where the finger first came down, so the widget stays under it exactly as it was picked up
      const next = dragFrom(lift.id, 'move', lift.x, lift.y, true)
      if (next) setDrag(next)
      return
    }
    const start = longPressStart.current
    if (!start) return
    if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) clearLongPress()
  }

  const onWidgetPointerUp = () => {
    const lift = liftRef.current
    clearLongPress()
    if (!lift) return
    endLift()
    // held and let go without moving; a drag that did start is dropped by the grid's handler after this one
    if (!dragRef.current) toggleWidgetSelection(lift.id)
  }

  const onWidgetPointerCancel = () => {
    clearLongPress()
    endLift()
  }

  // Android raises contextmenu for its own long press, which can come before the timer above. It means the
  // same thing, and left alone it can select text or open a menu under the finger.
  const onWidgetContextMenu = (id: string) => (e: React.MouseEvent) => {
    const start = longPressStart.current
    if (!start && !liftRef.current) return
    e.preventDefault()
    if (start && !liftRef.current) {
      clearLongPress()
      longPressStart.current = start
      liftWidget(id, start, e.currentTarget as HTMLElement, null)
    }
  }

  const onCellKeyDown = (id: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectWidget(id)
      return
    }
    // no key is called `constructor`, but a function is truthy and the guard below is `if (!step)`, so a bare
    // index would store a NaN rect
    const step = lookup(ARROW_STEPS, e.key)
    if (!step) return
    const widget = dashRef.current.widgets.find((w) => w.id === id)
    if (!widget) return
    e.preventDefault()
    const r = rectOf(widget)
    const next = e.shiftKey
      ? { ...r, w: Math.max(1, r.w + step.x), h: Math.max(1, r.h + step.y) }
      : { ...r, x: Math.max(0, r.x + step.x), y: Math.max(0, r.y + step.y) }
    setWidgetRect(id, next)
  }

  const toLocal = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = containerRef.current!.getBoundingClientRect()
    const k = pointerScale()
    return {
      x: Math.max(0, Math.min((clientX - rect.left) / k, rect.width / k)),
      y: Math.max(0, Math.min((clientY - rect.top) / k, rect.height / k))
    }
  }

  const onGridPointerDown = (e: React.PointerEvent) => {
    if (e.target !== containerRef.current) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    pendingRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      additive: e.shiftKey || e.ctrlKey || e.metaKey,
      fromWidget: false
    }
  }

  const finishMarquee = (m: MarqueeState) => {
    setMarquee(null)
    const box = {
      left: Math.min(m.startX, m.curX),
      top: Math.min(m.startY, m.curY),
      right: Math.max(m.startX, m.curX),
      bottom: Math.max(m.startY, m.curY)
    }
    const hit = widgetsOf(dashboard)
      .filter((w) => boxesOverlap(pixelBox(rectOf(w), colWidth, rowHeight, gap), box))
      .map((w) => w.id)
    const current = useEditorStore.getState().selectedIds
    setSelection(m.additive ? [...new Set([...current, ...hit])] : hit)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const pend = pendingRef.current
    if (pend && !marquee && !drag) {
      if (Math.abs(e.clientX - pend.clientX) > MARQUEE_THRESHOLD_PX || Math.abs(e.clientY - pend.clientY) > MARQUEE_THRESHOLD_PX) {
        pendingRef.current = null
        containerRef.current?.setPointerCapture(e.pointerId)
        const group = pend.moveId ? dragFrom(pend.moveId, 'move', pend.clientX, pend.clientY, true) : null
        if (group) {
          dragRef.current = group
          setDrag(group)
          lastPointer.current = { x: e.clientX, y: e.clientY }
          moveDrag(e.clientX, e.clientY)
          return
        }
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
    lastPointer.current = { x: e.clientX, y: e.clientY }
    moveDrag(e.clientX, e.clientY)
    edgeScroll.current.track(e.clientY)
  }

  // also run by the edge scroll with the last pointer position, after the page has moved under it
  const moveDrag = (clientX: number, clientY: number) => {
    const drag = dragRef.current
    if (!drag) return
    const { w: cw, h: ch } = cellSize()
    const k = pointerScale()
    const dx = (clientX - drag.startX) / k
    const dy = (clientY - drag.startY + window.scrollY - drag.startScroll) / k
    const cellsX = Math.round(dx / (cw + gap))
    const cellsY = Math.round(dy / (ch + gap))

    const start = drag.starts.get(drag.id)!
    const targets =
      drag.mode === 'move'
        ? shiftGroup(drag.starts, cellsX, cellsY, columnsOf(dashboard))
        : new Map([[drag.id, clampRect({ ...start, w: start.w + cellsX, h: start.h + cellsY }, columnsOf(dashboard))]])
    const goals = [...targets.values()]
    const overlaps = widgetsOf(dashboard).some((w) => !targets.has(w.id) && goals.some((g) => collides(g, rectOf(w))))
    // the whole group moves by the same step, so the widget under the pointer says whether it moved
    const target = targets.get(drag.id)!

    if (!sameRect(target, drag.targets.get(drag.id)!)) {
      clearDwell()
      if (drag.mode === 'move' && overlaps) dwellRef.current = window.setTimeout(armBump, BUMP_DWELL_MS)
    }
    setDrag((d) => {
      if (!d) return d
      const bump = sameRect(target, d.targets.get(d.id)!) ? d.bump : null
      return { ...d, dx, dy, targets, valid: !overlaps || !!bump, bump }
    })
  }
  moveRef.current = moveDrag

  const onPointerUp = (e: React.PointerEvent) => {
    const pend = pendingRef.current
    pendingRef.current = null
    if (marquee) {
      finishMarquee(marquee)
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
      return
    }
    if (pend && !pend.fromWidget) {
      if (!pend.additive) clearSelection()
      return
    }
    clearDwell()
    edgeScroll.current.stop()
    if (!drag) return
    if (drag.valid) setWidgetRects(drag.targets, drag.bump ?? undefined)
    // a drag started on a widget's body is a press the overlay saw begin, so its click is not a tap either
    if (drag.lifted && e.pointerType === 'mouse') {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
    }
    // a press on the handle that never moved is a tap, and a tap opens the settings. A real drag leaves the
    // selection and the panel as they were: opening the panel zooms the layout that was just being arranged.
    const clickLike =
      !drag.lifted &&
      Math.abs(e.clientX - drag.startX) <= MARQUEE_THRESHOLD_PX &&
      Math.abs(e.clientY - drag.startY + window.scrollY - drag.startScroll) <= MARQUEE_THRESHOLD_PX
    if (clickLike && (e.ctrlKey || e.metaKey)) toggleWidgetSelection(drag.id)
    else if (clickLike && e.shiftKey) addToSelection(drag.id)
    else if (clickLike) selectWidget(drag.id)
    setDrag(null)
  }

  const cancelPointer = () => {
    clearDwell()
    edgeScroll.current.stop()
    pendingRef.current = null
    setDrag(null)
    setMarquee(null)
  }

  if (containerWidth === 0) {
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
          '--nh-textscale': textScale(dashboard, rowHeight, coarse)
        } as React.CSSProperties
      }
      onPointerDown={onGridPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelPointer}>
      {/* panel frames, so a group reads as one panel while it is being edited too */}
      {groupFrames(widgetsOf(dashboard)).map((f) => (
        <div
          key={'g-' + f.group}
          className="nh-group"
          style={
            {
              gridColumn: `${f.rect.x + 1} / span ${f.rect.w}`,
              gridRow: `${f.rect.y + 1} / span ${f.rect.h}`,
              '--nh-cellaccent': f.color
            } as React.CSSProperties
          }
        />
      ))}

      {/* placeholders for the snapped drop target, one per widget being moved */}
      {drag
        ? [...drag.targets].map(([id, r]) => (
            <div
              key={'drop-' + id}
              className={'nh-drop' + (drag.valid ? '' : ' nh-drop--invalid')}
              style={{
                gridColumn: `${r.x + 1} / span ${r.w}`,
                gridRow: `${r.y + 1} / span ${r.h}`
              }}
            />
          ))
        : null}

      {/* palette drag-to-place preview: where the new widget would land */}
      {placeTarget ? (
        <div
          className={'nh-drop nh-drop--place' + (placeTarget.valid ? '' : ' nh-drop--invalid')}
          style={{
            gridColumn: `${placeTarget.rect.x + 1} / span ${placeTarget.rect.w}`,
            gridRow: `${placeTarget.rect.y + 1} / span ${placeTarget.rect.h}`
          }}>
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
            height: Math.abs(marquee.curY - marquee.startY)
          }}
        />
      ) : null}

      {widgetsOf(dashboard).map((widget) => {
        const bumpedTo = drag?.bump?.get(widget.id)
        const r = bumpedTo ?? rectOf(widget)
        const isDragging = drag?.starts.has(widget.id) === true
        const isSelected = selectedIds.includes(widget.id)
        const hiddenOn = hiddenSurfaces(widget)
        const offHere = editedSurfaces.every((sfc) => hiddenOn.includes(sfc))
        return (
          <div
            key={widget.id}
            className={
              'nh-cell' +
              (isSelected ? ' nh-cell--selected' : '') +
              (isDragging ? ' nh-cell--dragging' : '') +
              (lifted === widget.id && !isDragging ? ' nh-cell--lifted' : '') +
              (bumpedTo ? ' nh-cell--bumped' : '') +
              (hiddenOn.length > 0 ? ' nh-cell--hidden' : '') +
              (offHere ? ' nh-cell--offhere' : '') +
              (widgetLabelBottom(widget) ? ' nh-labelbottom' : '') +
              (widgetAccent(widget) ? ` nh-acc-${widgetAccent(widget)}` : '')
            }
            style={
              {
                gridColumn: `${r.x + 1} / span ${r.w}`,
                gridRow: `${r.y + 1} / span ${r.h}`,
                minWidth: 0,
                minHeight: 0,
                '--nh-widgetscale': widgetTextScale(widget),
                '--nh-labelalign': widgetLabelAlign(widget),
                '--nh-cellaccent': widgetAccentColor(widget),
                '--nh-accent-ink': widgetAccentInk(widget),
                transform: isDragging && drag.mode === 'move' ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                width: isDragging && drag.mode === 'resize' ? `max(40px, calc(100% + ${drag.dx}px))` : undefined,
                height: isDragging && drag.mode === 'resize' ? `max(40px, calc(100% + ${drag.dy}px))` : undefined
              } as React.CSSProperties
            }>
            <WidgetHost instance={widget} editing />

            {/* Edit overlay: tap selects, handle strip drags, corner resizes. It is a real
                button, so the whole editor is reachable from the keyboard. Tab moves between
                widgets, Enter/Space selects, arrows move the selection and Shift+arrows resize
                it (see onCellKeyDown). */}
            <button
              type="button"
              className="nh-cell__overlay"
              aria-label={t('{{type}} widget - press Enter to select, arrow keys to move', {
                type: widget.type
              })}
              aria-pressed={isSelected}
              onClick={onWidgetClick(widget.id)}
              onKeyDown={onCellKeyDown(widget.id)}
              onPointerDown={onWidgetPointerDown(widget.id)}
              onPointerMove={onWidgetPointerMove}
              onPointerUp={onWidgetPointerUp}
              onPointerCancel={onWidgetPointerCancel}
              onContextMenu={onWidgetContextMenu(widget.id)}
            />
            <CellHandle
              id={widget.id}
              type={widget.type}
              hiddenOn={hiddenOn}
              offHere={offHere}
              scoped={scopedDelete}
              onDragStart={beginDrag(widget.id, 'move')}
            />
            <div className="nh-cell__resize" onPointerDown={beginDrag(widget.id, 'resize')} />
          </div>
        )
      })}
    </div>
  )
}
