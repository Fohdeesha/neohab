/**
 * Responsive dashboard grid.
 *
 * Wide viewports render the authored `lg` layout on a CSS grid of `dashboard.columns`, with the
 * row height either fixed or matching the column width ('match' = square cells, the HABPanel
 * convention, so dashboards keep their proportions at any width). Narrow viewports (phones)
 * collapse to a single-column stack (see stackedOrder: pinned order when the user reordered it,
 * else row by row); stacked heights preserve the author's intent by sizing rows as they would
 * render at a reference desktop width, with each widget's minPixelHeight as a floor so controls
 * never clip on phones. Stacked rows size their text per row (see stackedTextScale) rather than
 * from the grid's proportional scale, because a full-width row's room is its own height.
 *
 * Intermediate breakpoints (auto-derived md/sm) and drag-to-edit are later phases; this
 * component reads the same layout schema they will, so adding them needs no data change.
 */
import { useRef } from 'react'
import type { Dashboard, Rect, WidgetInstance } from '../model/dashboard'
import {
  cellMetrics,
  iconScale,
  stackedOrder,
  stackedTextScale,
  textScale,
  STACK_BELOW,
  STACK_REFERENCE_WIDTH,
} from '../model/layout'
import { getWidgetDefinition } from '../widgets/registry'
import { WidgetHost } from './WidgetHost'
import { useContainerWidth } from './useContainerWidth'

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
    const ordered = stackedOrder(dashboard)
    return (
      <div
        ref={ref}
        className="nh-grid nh-grid--stacked"
        style={
          {
            gap: dashboard.gap ?? 8,
            '--nh-iconscale': iconScale(dashboard, unit),
          } as React.CSSProperties
        }
      >
        {ordered.map((w) => {
          const min = getWidgetDefinition(w.type)?.minPixelHeight ?? 0
          const height = Math.round(Math.max(rectOf(w).h * unit, min))
          return (
            <div
              key={w.id}
              className="nh-gcell"
              style={
                { height, '--nh-textscale': stackedTextScale(dashboard, unit, height) } as React.CSSProperties
              }
            >
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
      style={
        {
          gridTemplateColumns: `repeat(${dashboard.columns}, 1fr)`,
          gridAutoRows: `${rowHeight}px`,
          gap,
          '--nh-iconscale': iconScale(dashboard, rowHeight),
          '--nh-textscale': textScale(dashboard, rowHeight),
        } as React.CSSProperties
      }
    >
      {dashboard.widgets.map((w) => {
        const r = rectOf(w)
        return (
          <div
            key={w.id}
            className="nh-gcell"
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
