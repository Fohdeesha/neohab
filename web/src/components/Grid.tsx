/**
 * Responsive dashboard grid.
 *
 * Wide viewports render the authored `lg` layout on a CSS grid of `dashboard.columns`, with the
 * row height either fixed or matching the column width ('match' = square cells, the HABPanel
 * convention, so dashboards keep their proportions at any width). Narrow viewports (phones)
 * collapse to a single-column stack ordered by row then column; stacked heights preserve the
 * author's intent by sizing rows as they would render at a reference desktop width, with each
 * widget's minPixelHeight as a floor so controls never clip on phones.
 *
 * Intermediate breakpoints (auto-derived md/sm) and drag-to-edit are later phases; this
 * component reads the same layout schema they will, so adding them needs no data change.
 */
import { useRef } from 'react'
import type { Dashboard, Rect, WidgetInstance } from '../model/dashboard'
import { cellMetrics } from '../model/layout'
import { getWidgetDefinition } from '../widgets/registry'
import { WidgetHost } from './WidgetHost'
import { useContainerWidth } from './useContainerWidth'

const STACK_BELOW = 720 // px
/** Assumed desktop width when computing stacked heights for 'match' dashboards. */
const STACK_REFERENCE_WIDTH = 1280

function rectOf(widget: WidgetInstance): Rect {
  return widget.layout.lg ?? { x: 0, y: 0, w: 3, h: 3 }
}

export function Grid({ dashboard, editing = false }: { dashboard: Dashboard; editing?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(ref)

  if (width === 0) {
    // First paint: width unknown, render the container alone and lay out next frame.
    return <div ref={ref} className="nh-grid" />
  }

  if (dashboard.widgets.length === 0) {
    return <p className="nh-dash__empty">This dashboard has no widgets yet — tap ✎ to start adding some.</p>
  }

  if (width < STACK_BELOW) {
    const unit = cellMetrics(dashboard, STACK_REFERENCE_WIDTH).rowHeight
    const ordered = [...dashboard.widgets].sort((a, b) => {
      const ra = rectOf(a)
      const rb = rectOf(b)
      return ra.y - rb.y || ra.x - rb.x
    })
    return (
      <div ref={ref} className="nh-grid nh-grid--stacked" style={{ gap: dashboard.gap ?? 8 }}>
        {ordered.map((w) => {
          const min = getWidgetDefinition(w.type)?.minPixelHeight ?? 0
          return (
            <div key={w.id} style={{ height: Math.round(Math.max(rectOf(w).h * unit, min)) }}>
              <WidgetHost instance={w} editing={editing} />
            </div>
          )
        })}
      </div>
    )
  }

  const { gap, rowHeight } = cellMetrics(dashboard, width)
  return (
    <div
      ref={ref}
      className="nh-grid"
      style={{
        gridTemplateColumns: `repeat(${dashboard.columns}, 1fr)`,
        gridAutoRows: `${rowHeight}px`,
        gap,
      }}
    >
      {dashboard.widgets.map((w) => {
        const r = rectOf(w)
        return (
          <div
            key={w.id}
            style={{
              gridColumn: `${r.x + 1} / span ${r.w}`,
              gridRow: `${r.y + 1} / span ${r.h}`,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <WidgetHost instance={w} editing={editing} />
          </div>
        )
      })}
    </div>
  )
}
