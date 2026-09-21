import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Dashboard, WidgetInstance } from '../model/dashboard'
import {
  cellMetrics,
  columnsOf,
  gapOf,
  groupFrames,
  hasTabletLayout,
  iconScale,
  isHiddenOn,
  projectDashboard,
  rectOf,
  stackedCellHeight,
  stackedOrder,
  stackedTextScale,
  surfaceFor,
  textScale,
  widgetAccent,
  widgetAccentColor,
  widgetAccentInk,
  widgetLabelAlign,
  widgetLabelBottom,
  widgetsOf,
  widgetTextScale,
  STACK_REFERENCE_WIDTH
} from '../model/layout'
import { instanceFixedShape, instanceMinHeight } from '../widgets/registry'
import { useEditingAllowed } from '../store/auth'
import { useSurfaceBounds } from './useSurfaceBounds'
import { WidgetHost } from './WidgetHost'
import { useCoarsePointer } from './useCoarsePointer'
import { useContainerWidth } from './useContainerWidth'
import { useLongPress } from './useLongPress'
import { WidgetDetail } from './WidgetDetail'
import { instanceDetailRoute, instanceHasDetail } from '../widgets'
import { navigate } from '../app/router'

function Cell({
  className,
  style,
  instance,
  editing,
  stacked,
  onDetail
}: {
  className: string
  style: React.CSSProperties
  instance: WidgetInstance
  editing: boolean
  stacked?: boolean
  onDetail: (w: WidgetInstance) => void
}) {
  const press = useLongPress(() => onDetail(instance), !editing && instanceHasDetail(instance.type, instance.config))
  return (
    <div className={className} style={style} {...press}>
      <WidgetHost instance={instance} editing={editing} stacked={stacked} />
    </div>
  )
}

export function Grid(props: { dashboard: Dashboard; editing?: boolean }) {
  const { editing = false } = props
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(ref)
  const coarse = useCoarsePointer()
  const canEdit = useEditingAllowed()
  const bounds = useSurfaceBounds()
  // declared with the other hooks - the early returns below skip later code
  const [detail, setDetail] = useState<WidgetInstance | null>(null)
  const openDetail = (w: WidgetInstance) => {
    const route = instanceDetailRoute(w.type, props.dashboard.id, w.id)
    if (route) navigate(route)
    else setDetail(w)
  }

  if (width === 0) {
    return <div ref={ref} className="nh-grid" />
  }

  // the measured container stays mounted on every path, or the width can never be read again (see
  // useContainerWidth)
  if (widgetsOf(props.dashboard).length === 0) {
    return (
      <div ref={ref} className="nh-grid">
        <p className="nh-dash__empty">
          {canEdit ? t('This dashboard has no widgets yet - tap ✎ to start adding some.') : t('This dashboard has no widgets yet.')}
        </p>
      </div>
    )
  }

  const surface = surfaceFor(width, bounds)
  // always through the projection, so a stored rect past the column count is clamped rather than
  // placed into an implicit grid track that collapses to nothing
  const dashboard = projectDashboard(props.dashboard, surface === 'tablet' && hasTabletLayout(props.dashboard) ? 'md' : 'lg')
  const shown = widgetsOf(dashboard).filter((w) => !isHiddenOn(w, surface))
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
            gap: gapOf(dashboard),
            '--nh-iconscale': iconScale(dashboard, unit)
          } as React.CSSProperties
        }>
        {ordered.map((w) => {
          const min = instanceMinHeight(w.type, w.config)
          const height = stackedCellHeight(dashboard, rectOf(w), width, min, instanceFixedShape(w.type))
          return (
            <Cell
              key={w.id}
              instance={w}
              editing={editing}
              stacked
              onDetail={openDetail}
              className={
                'nh-gcell' + (widgetLabelBottom(w) ? ' nh-labelbottom' : '') + (widgetAccent(w) ? ` nh-acc-${widgetAccent(w)}` : '')
              }
              style={
                {
                  height,
                  '--nh-textscale': stackedTextScale(dashboard, unit, height, coarse),
                  '--nh-widgetscale': widgetTextScale(w),
                  '--nh-labelalign': widgetLabelAlign(w),
                  '--nh-cellaccent': widgetAccentColor(w),
                  '--nh-accent-ink': widgetAccentInk(w)
                } as React.CSSProperties
              }
            />
          )
        })}
        {detail ? <WidgetDetail instance={detail} onClose={() => setDetail(null)} /> : null}
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
          '--nh-textscale': textScale(dashboard, rowHeight, coarse)
        } as React.CSSProperties
      }>
      {shown.map((w) => {
        const r = rectOf(w)
        return (
          <Cell
            key={w.id}
            instance={w}
            editing={editing}
            onDetail={openDetail}
            className={'nh-gcell' + (widgetLabelBottom(w) ? ' nh-labelbottom' : '') + (widgetAccent(w) ? ` nh-acc-${widgetAccent(w)}` : '')}
            style={
              {
                gridColumn: `${r.x + 1} / span ${r.w}`,
                gridRow: `${r.y + 1} / span ${r.h}`,
                minWidth: 0,
                minHeight: 0,
                '--nh-widgetscale': widgetTextScale(w),
                '--nh-labelalign': widgetLabelAlign(w),
                '--nh-cellaccent': widgetAccentColor(w),
                '--nh-accent-ink': widgetAccentInk(w)
              } as React.CSSProperties
            }
          />
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
              '--nh-cellaccent': f.color
            } as React.CSSProperties
          }
        />
      ))}
      {detail ? <WidgetDetail instance={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  )
}
