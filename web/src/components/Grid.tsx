/**
 * Responsive dashboard grid.
 *
 * Wide viewports render the authored `lg` layout on a CSS grid of `dashboard.columns`. Narrow
 * viewports (phones) collapse to a single-column stack ordered by row then column, so a
 * dashboard is always usable on mobile with no per-breakpoint authoring required.
 *
 * Intermediate breakpoints (auto-derived md/sm) and drag-to-edit are later phases; this
 * component reads the same layout schema they will, so adding them needs no data change.
 */
import { useEffect, useRef, useState } from 'react'
import type { Dashboard, Rect, WidgetInstance } from '../model/dashboard'
import { WidgetHost } from './WidgetHost'

const STACK_BELOW = 720 // px
const GAP = 8

function rectOf(widget: WidgetInstance): Rect {
  return widget.layout.lg ?? { x: 0, y: 0, w: 3, h: 3 }
}

export function Grid({ dashboard, editing = false }: { dashboard: Dashboard; editing?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [stacked, setStacked] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setStacked(entries[0].contentRect.width < STACK_BELOW)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (stacked) {
    const ordered = [...dashboard.widgets].sort((a, b) => {
      const ra = rectOf(a)
      const rb = rectOf(b)
      return ra.y - rb.y || ra.x - rb.x
    })
    return (
      <div ref={ref} className="nh-grid nh-grid--stacked" style={{ gap: GAP }}>
        {ordered.map((w) => (
          <div key={w.id} style={{ height: rectOf(w).h * dashboard.rowHeight }}>
            <WidgetHost instance={w} editing={editing} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className="nh-grid"
      style={{
        gridTemplateColumns: `repeat(${dashboard.columns}, 1fr)`,
        gridAutoRows: `${dashboard.rowHeight}px`,
        gap: GAP,
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
