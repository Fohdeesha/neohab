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
 */
import { useEffect, useRef, useState } from 'react'
import type { Dashboard, Rect } from '../model/dashboard'
import {
  cellMetrics,
  clampRect,
  iconScale,
  overlapsAny,
  planBump,
  rectOf,
  STACK_BELOW,
  type BumpPlan,
} from '../model/layout'
import { selectWidget, setWidgetRect, useEditorStore } from '../store/editor'
import { CellHandle } from './CellHandle'
import { WidgetHost } from './WidgetHost'
import { StackedEditGrid } from './StackedEditGrid'
import { useContainerWidth } from './useContainerWidth'
import { useViewportWidth } from './useViewportWidth'

/**
 * How long a move must rest on an occupied target before the widgets there are bumped aside.
 * Dragging across the grid crosses plenty of widgets on the way; only stopping on one means it.
 */
const BUMP_DWELL_MS = 400

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

const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

export function EditableGrid({ dashboard }: { dashboard: Dashboard }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const selectedId = useEditorStore((s) => s.selectedId)
  const containerWidth = useContainerWidth(containerRef)
  const viewportWidth = useViewportWidth()
  const dwellRef = useRef<number | null>(null)
  const { gap, rowHeight } = cellMetrics(dashboard, containerWidth)

  const clearDwell = () => {
    if (dwellRef.current !== null) {
      window.clearTimeout(dwellRef.current)
      dwellRef.current = null
    }
  }
  useEffect(() => clearDwell, [])

  if (viewportWidth < STACK_BELOW) {
    // Phones edit the stack they actually see: reorder + settings, not grid geometry.
    // (Viewport width, not container width: the side panel shrinking the container on a
    // desktop must not flip the editor to the stacked surface mid-edit.)
    return <StackedEditGrid dashboard={dashboard} />
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
      const plan = planBump(dashboard, d.id, d.target)
      if (!plan || plan.size === 0) return d
      return { ...d, bump: plan, valid: true }
    })
  }

  const onPointerMove = (e: React.PointerEvent) => {
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
      dashboard.columns
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

  const onPointerUp = () => {
    clearDwell()
    if (!drag) return
    if (drag.valid) setWidgetRect(drag.id, drag.target, drag.bump ?? undefined)
    setDrag(null)
    selectWidget(drag.id)
  }

  const cancelDrag = () => {
    clearDwell()
    setDrag(null)
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
          gridTemplateColumns: `repeat(${dashboard.columns}, 1fr)`,
          gridAutoRows: `${rowHeight}px`,
          gap,
          '--nh-iconscale': iconScale(dashboard, rowHeight),
        } as React.CSSProperties
      }
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelDrag}
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

      {dashboard.widgets.map((widget) => {
        // An armed bump previews itself: the widgets it moves render where the drop puts them.
        const bumpedTo = drag?.bump?.get(widget.id)
        const r = bumpedTo ?? rectOf(widget)
        const isDragging = drag?.id === widget.id
        const isSelected = selectedId === widget.id
        return (
          <div
            key={widget.id}
            className={
              'nh-cell' +
              (isSelected ? ' nh-cell--selected' : '') +
              (isDragging ? ' nh-cell--dragging' : '') +
              (bumpedTo ? ' nh-cell--bumped' : '')
            }
            style={{
              gridColumn: `${r.x + 1} / span ${r.w}`,
              gridRow: `${r.y + 1} / span ${r.h}`,
              minWidth: 0,
              minHeight: 0,
              transform: isDragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
            }}
          >
            <WidgetHost instance={widget} editing />

            {/* edit overlay: tap selects, handle strip drags, corner resizes */}
            <div
              className="nh-cell__overlay"
              onClick={(e) => {
                e.stopPropagation()
                selectWidget(widget.id)
              }}
            />
            <CellHandle id={widget.id} type={widget.type} onDragStart={beginDrag(widget.id, 'move')} />
            <div className="nh-cell__resize" onPointerDown={beginDrag(widget.id, 'resize')} />
          </div>
        )
      })}
    </div>
  )
}
