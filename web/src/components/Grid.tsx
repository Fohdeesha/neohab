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
 * Between the two sits the tablet band (see MD_BELOW): a dashboard that has a tablet layout
 * renders that one there, with its own column count; one that has not keeps rendering the desktop
 * layout, exactly as it always did. Widgets can also be hidden per surface (`config.hideOn`), so a
 * chart can be desktop-only and a big control can stay off the phone stack.
 */
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Dashboard, Rect, WidgetInstance } from '../model/dashboard'
import {
  cellMetrics,
  columnsOf,
  groupFrames,
  hasTabletLayout,
  iconScale,
  isHiddenOn,
  projectDashboard,
  stackedOrder,
  stackedTextScale,
  surfaceFor,
  textScale,
  widgetAccent,
  widgetAccentColor,
  widgetAccentInk,
  widgetLabelAlign,
  widgetLabelBottom,
  widgetTextScale,
  STACK_REFERENCE_WIDTH,
} from '../model/layout'
import { getWidgetDefinition } from '../widgets/registry'
import { WidgetHost } from './WidgetHost'
import { useContainerWidth } from './useContainerWidth'

function rectOf(widget: WidgetInstance): Rect {
  return widget.layout.lg ?? { x: 0, y: 0, w: 3, h: 3 }
}

export function Grid(props: { dashboard: Dashboard; editing?: boolean }) {
  const { editing = false } = props
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(ref)

  if (width === 0) {
    // First paint: width unknown, render the container alone and lay out next frame.
    return <div ref={ref} className="nh-grid" />
  }

  // Note the container stays mounted on every path below: swapping it for a bare message would
  // detach the element the width is measured from (see useContainerWidth).
  if (props.dashboard.widgets.length === 0) {
    return (
      <div ref={ref} className="nh-grid">
        <p className="nh-dash__empty">{t('This dashboard has no widgets yet — tap ✎ to start adding some.')}</p>
      </div>
    )
  }

  // The tablet band renders the tablet layout when there is one; otherwise nothing changes.
  const surface = surfaceFor(width)
  const dashboard =
    surface === 'tablet' && hasTabletLayout(props.dashboard)
      ? projectDashboard(props.dashboard, 'md')
      : props.dashboard
  const shown = dashboard.widgets.filter((w) => !isHiddenOn(w, surface))
  if (shown.length === 0) {
    return (
      <div ref={ref} className="nh-grid">
        <p className="nh-dash__empty">{t('Every widget on this dashboard is hidden at this screen size.')}</p>
      </div>
    )
  }

  if (surface === 'phone') {
    const unit = cellMetrics(dashboard, STACK_REFERENCE_WIDTH).rowHeight
    const ordered = stackedOrder({ ...dashboard, widgets: shown })
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
              className={
                'nh-gcell' +
                (widgetLabelBottom(w) ? ' nh-labelbottom' : '') +
                (widgetAccent(w) ? ` nh-acc-${widgetAccent(w)}` : '')
              }
              style={
                {
                  height,
                  '--nh-textscale': stackedTextScale(dashboard, unit, height),
                  '--nh-widgetscale': widgetTextScale(w),
                  '--nh-labelalign': widgetLabelAlign(w),
                  '--nh-cellaccent': widgetAccentColor(w),
                  '--nh-accent-ink': widgetAccentInk(w),
                } as React.CSSProperties
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
          gridTemplateColumns: `repeat(${columnsOf(dashboard)}, 1fr)`,
          gridAutoRows: `${rowHeight}px`,
          gap,
          '--nh-iconscale': iconScale(dashboard, rowHeight),
          '--nh-textscale': textScale(dashboard, rowHeight),
        } as React.CSSProperties
      }
    >
      {shown.map((w) => {
        const r = rectOf(w)
        return (
          <div
            key={w.id}
            className={
              'nh-gcell' +
              (widgetLabelBottom(w) ? ' nh-labelbottom' : '') +
              (widgetAccent(w) ? ` nh-acc-${widgetAccent(w)}` : '')
            }
            style={
              {
                gridColumn: `${r.x + 1} / span ${r.w}`,
                gridRow: `${r.y + 1} / span ${r.h}`,
                minWidth: 0,
                minHeight: 0,
                '--nh-widgetscale': widgetTextScale(w),
                '--nh-labelalign': widgetLabelAlign(w),
                '--nh-cellaccent': widgetAccentColor(w),
                '--nh-accent-ink': widgetAccentInk(w),
              } as React.CSSProperties
            }
          >
            <WidgetHost instance={w} editing={editing} />
          </div>
        )
      })}
      {/* Panel frames last: a tile with an opaque background would otherwise paint over the
          rule, so the frame would only be visible in themes whose tiles are transparent.
          Drawing over the cells' own edges is what a panel frame is for, and it is inert to
          the pointer, so nothing underneath loses a tap. */}
      {groupFrames(shown).map((f) => (
        <div
          key={'g-' + f.group}
          className="nh-group"
          style={
            {
              gridColumn: `${f.rect.x + 1} / span ${f.rect.w}`,
              gridRow: `${f.rect.y + 1} / span ${f.rect.h}`,
              '--nh-cellaccent': f.color,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
