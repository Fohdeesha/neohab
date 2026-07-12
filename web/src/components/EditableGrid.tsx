/**
 * Edit-mode grid: same geometry as the runtime Grid, plus selection, drag (via the handle
 * strip), and resize (corner handle) using pointer events - one code path for mouse and touch.
 *
 * Interaction model: the dragged widget follows the pointer with a CSS transform while a
 * placeholder shows the snapped target cell; green = free, red = occupied. Dropping on an
 * occupied spot reverts (no push/cascade - predictable on touch). Layout edits require the
 * full grid, so this component is only used on wide viewports; narrow screens keep settings
 * editing but not drag (see DashboardView).
 */
import { useRef, useState } from 'react'
import type { Dashboard, Rect } from '../model/dashboard'
import { cellMetrics, clampRect, overlapsAny, rectOf } from '../model/layout'
import { selectWidget, setWidgetRect, useEditorStore } from '../store/editor'
import { WidgetHost } from './WidgetHost'
import { useContainerWidth } from './useContainerWidth'

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
}

export function EditableGrid({ dashboard }: { dashboard: Dashboard }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const selectedId = useEditorStore((s) => s.selectedId)
  const containerWidth = useContainerWidth(containerRef)
  const { gap, rowHeight } = cellMetrics(dashboard, containerWidth)

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
    selectWidget(id)
    const startRect = rectOf(widget)
    setDrag({ id, mode, startRect, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0, target: startRect, valid: true })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    const { w: cw, h: ch } = cellSize()
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const cellsX = Math.round(dx / (cw + gap))
    const cellsY = Math.round(dy / (ch + gap))

    const target = clampRect(
      drag.mode === 'move'
        ? { ...drag.startRect, x: drag.startRect.x + cellsX, y: drag.startRect.y + cellsY }
        : { ...drag.startRect, w: drag.startRect.w + cellsX, h: drag.startRect.h + cellsY },
      dashboard.columns
    )
    const valid = !overlapsAny(dashboard, target, drag.id)
    setDrag({ ...drag, dx, dy, target, valid })
  }

  const onPointerUp = () => {
    if (!drag) return
    if (drag.valid) setWidgetRect(drag.id, drag.target)
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
      style={{
        gridTemplateColumns: `repeat(${dashboard.columns}, 1fr)`,
        gridAutoRows: `${rowHeight}px`,
        gap,
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
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
        const r = rectOf(widget)
        const isDragging = drag?.id === widget.id
        const isSelected = selectedId === widget.id
        return (
          <div
            key={widget.id}
            className={
              'nh-cell' + (isSelected ? ' nh-cell--selected' : '') + (isDragging ? ' nh-cell--dragging' : '')
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
            <div className="nh-cell__handle" onPointerDown={beginDrag(widget.id, 'move')}>
              <span className="nh-cell__grip">⋮⋮</span>
              <span className="nh-cell__type">{widget.type}</span>
            </div>
            <div className="nh-cell__resize" onPointerDown={beginDrag(widget.id, 'resize')} />
          </div>
        )
      })}
    </div>
  )
}
