/**
 * Narrow-viewport (phone) edit surface: the same single-column stack as the runtime grid,
 * with drag-to-reorder via each widget's handle. The first reorder pins an explicit
 * stackOrder on the dashboard; until then the stack follows the grid's row order. Widget
 * position/size on the wide grid is still edited on a wide viewport — here the handle only
 * moves widgets up and down, with a line showing where the drop lands.
 */
import { useRef, useState } from 'react'
import type { Dashboard } from '../model/dashboard'
import { cellMetrics, stackedOrder, STACK_REFERENCE_WIDTH } from '../model/layout'
import { getWidgetDefinition } from '../widgets/registry'
import { selectWidget, updateDashboardMeta, useEditorStore } from '../store/editor'
import { WidgetHost } from './WidgetHost'

interface DragState {
  id: string
  startY: number
  dy: number
  /** Insertion position among the non-dragged rows. */
  insertPos: number
}

export function StackedEditGrid({ dashboard }: { dashboard: Dashboard }) {
  const ordered = stackedOrder(dashboard)
  const unit = cellMetrics(dashboard, STACK_REFERENCE_WIDTH).rowHeight
  const selectedId = useEditorStore((s) => s.selectedId)
  const [drag, setDrag] = useState<DragState | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

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
    selectWidget(id)
    setDrag({ id, startY: e.clientY, dy: 0, insertPos: insertPosFor(e.clientY, id) })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return
    setDrag({ ...drag, dy: e.clientY - drag.startY, insertPos: insertPosFor(e.clientY, drag.id) })
  }

  const onPointerUp = () => {
    if (!drag) return
    const from = ordered.findIndex((w) => w.id === drag.id)
    setDrag(null)
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
      style={{ gap: dashboard.gap ?? 8 }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
    >
      {ordered.map((widget) => {
        const min = getWidgetDefinition(widget.type)?.minPixelHeight ?? 0
        const rect = widget.layout.lg ?? { h: 3 }
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
                (selectedId === widget.id ? ' nh-cell--selected' : '') +
                (isDragging ? ' nh-cell--dragging' : '')
              }
              style={{
                height: Math.round(Math.max(rect.h * unit, min)),
                transform: isDragging ? `translateY(${drag.dy}px)` : undefined,
              }}
            >
              <WidgetHost instance={widget} editing />
              <div
                className="nh-cell__overlay"
                onClick={(e) => {
                  e.stopPropagation()
                  selectWidget(widget.id)
                }}
              />
              <div className="nh-cell__handle" onPointerDown={beginDrag(widget.id)}>
                <span className="nh-cell__grip">⋮⋮</span>
                <span className="nh-cell__type">{widget.type}</span>
              </div>
            </div>
          </div>
        )
      })}
      {drag && drag.insertPos === nonDragged ? <div className="nh-stackdrop" /> : null}
    </div>
  )
}
