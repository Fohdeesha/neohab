import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Dashboard, Rect } from '../model/dashboard'
import {
  cellMetrics,
  clampRect,
  columnsOf,
  groupFrames,
  hiddenSurfaces,
  iconScale,
  overlapsAny,
  planBump,
  projectDashboard,
  rectOf,
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
  toggleWidgetSelection,
  useEditorStore
} from '../store/editor'
import { lookup } from '../model/lookup'
import { CellHandle } from './CellHandle'
import { WidgetHost } from './WidgetHost'
import { StackedEditGrid } from './StackedEditGrid'
import { useCoarsePointer } from './useCoarsePointer'
import { useContainerWidth } from './useContainerWidth'
import { useGridEditSurface } from './useEditSurface'

const BUMP_DWELL_MS = 400

const LONG_PRESS_MS = 500

interface DragState {
  id: string
  mode: 'move' | 'resize'
  startRect: Rect
  startX: number
  startY: number
  dx: number
  dy: number
  target: Rect
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

export function EditableGrid({ dashboard: draft }: { dashboard: Dashboard }) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const bp = useEditorStore((s) => s.bp)
  const placing = useEditorStore((s) => s.placing)
  const dashboard = projectDashboard(draft, bp)
  const [placeTarget, setPlaceTarget] = useState<{ rect: Rect; valid: boolean } | null>(null)
  const containerWidth = useContainerWidth(containerRef)
  const coarse = useCoarsePointer()
  const gridSurface = useGridEditSurface()
  const dwellRef = useRef<number | null>(null)
  const longPressRef = useRef<number | null>(null)
  const longPressStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)
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
  useEffect(
    () => () => {
      clearDwell()
      clearLongPress()
    },
    []
  )

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
    return <StackedEditGrid dashboard={draft} />
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

  const beginDrag = (id: string, mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const widget = widgetsOf(dashboard).find((w) => w.id === id)
    if (!widget) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    // selection waits for the drop: opening the panel changes the zoom the drag is measured against
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
      bump: null
    })
  }

  const armBump = () => {
    dwellRef.current = null
    setDrag((d) => {
      if (!d || d.mode !== 'move') return d
      const plan = planBump(dashRef.current, d.id, d.target)
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
        pendingRef.current = {
          clientX: e.clientX,
          clientY: e.clientY,
          additive: e.shiftKey || e.ctrlKey || e.metaKey,
          fromWidget: true
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
    const k = pointerScale()
    const dx = (e.clientX - drag.startX) / k
    const dy = (e.clientY - drag.startY) / k
    const cellsX = Math.round(dx / (cw + gap))
    const cellsY = Math.round(dy / (ch + gap))

    const target = clampRect(
      drag.mode === 'move'
        ? { ...drag.startRect, x: drag.startRect.x + cellsX, y: drag.startRect.y + cellsY }
        : { ...drag.startRect, w: drag.startRect.w + cellsX, h: drag.startRect.h + cellsY },
      columnsOf(dashboard)
    )
    const overlaps = overlapsAny(dashboard, target, drag.id)

    if (!sameRect(target, drag.target)) {
      clearDwell()
      if (drag.mode === 'move' && overlaps) dwellRef.current = window.setTimeout(armBump, BUMP_DWELL_MS)
    }
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
    if (!drag) return
    if (drag.valid) setWidgetRect(drag.id, drag.target, drag.bump ?? undefined)
    const clickLike = Math.abs(e.clientX - drag.startX) <= MARQUEE_THRESHOLD_PX && Math.abs(e.clientY - drag.startY) <= MARQUEE_THRESHOLD_PX
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

      {/* placeholder for the snapped drop target */}
      {drag ? (
        <div
          className={'nh-drop' + (drag.valid ? '' : ' nh-drop--invalid')}
          style={{
            gridColumn: `${drag.target.x + 1} / span ${drag.target.w}`,
            gridRow: `${drag.target.y + 1} / span ${drag.target.h}`
          }}
        />
      ) : null}

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
        const isDragging = drag?.id === widget.id
        const isSelected = selectedIds.includes(widget.id)
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
              onPointerUp={clearLongPress}
              onPointerCancel={clearLongPress}
            />
            <CellHandle id={widget.id} type={widget.type} hiddenOn={hiddenOn} onDragStart={beginDrag(widget.id, 'move')} />
            <div className="nh-cell__resize" onPointerDown={beginDrag(widget.id, 'resize')} />
          </div>
        )
      })}
    </div>
  )
}
