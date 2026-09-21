import { useTranslation } from 'react-i18next'
import type { Surface } from '../model/layout'
import { removeWidget, showWidgetHere } from '../store/editor'

const SURFACE_LABEL: Record<Surface, string> = { phone: 'phones', tablet: 'tablets', desktop: 'desktops' }

export function CellHandle({
  id,
  type,
  hiddenOn = [],
  offHere = false,
  scoped = false,
  onDragStart
}: {
  id: string
  type: string
  hiddenOn?: Surface[]
  /** hidden on every surface the layout being edited draws, so it is not part of THIS layout */
  offHere?: boolean
  /** delete takes it off this layout only, because the dashboard has more than one */
  scoped?: boolean
  onDragStart: (e: React.PointerEvent) => void
}) {
  const { t } = useTranslation()
  const hiddenList = t('Hidden on {{list}}', { list: hiddenOn.map((sfc) => t(SURFACE_LABEL[sfc])).join(', ') })
  return (
    <div className="nh-cell__handle" onPointerDown={onDragStart}>
      <span className="nh-cell__grip">⋮⋮</span>
      <span className="nh-cell__type">{type}</span>
      {/* off this layout: the badge is the way back, so it is a button rather than the mark that
          says a widget is hidden somewhere else */}
      {offHere ? (
        <button
          type="button"
          className="nh-cell__restore"
          aria-label={t('Put it back on this layout')}
          title={hiddenList + ' - ' + t('Put it back on this layout')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            showWidgetHere(id)
          }}>
          ↺
        </button>
      ) : hiddenOn.length > 0 ? (
        <span className="nh-cell__hidden" title={hiddenList}>
          ◌
        </span>
      ) : null}
      <button
        type="button"
        className="nh-cell__delete"
        aria-label={scoped ? t('Remove from this layout') : t('Delete widget')}
        title={scoped ? t('Remove from this layout') : t('Delete widget')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          removeWidget(id)
        }}>
        ✕
      </button>
    </div>
  )
}
