import { useTranslation } from 'react-i18next'
import type { Surface } from '../model/layout'
import { removeWidget } from '../store/editor'

const SURFACE_LABEL: Record<Surface, string> = { phone: 'phones', tablet: 'tablets', desktop: 'desktops' }

export function CellHandle({
  id,
  type,
  hiddenOn = [],
  onDragStart
}: {
  id: string
  type: string
  hiddenOn?: Surface[]
  onDragStart: (e: React.PointerEvent) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="nh-cell__handle" onPointerDown={onDragStart}>
      <span className="nh-cell__grip">⋮⋮</span>
      <span className="nh-cell__type">{type}</span>
      {hiddenOn.length > 0 ? (
        <span
          className="nh-cell__hidden"
          title={t('Hidden on {{list}}', { list: hiddenOn.map((sfc) => t(SURFACE_LABEL[sfc])).join(', ') })}>
          ◌
        </span>
      ) : null}
      <button
        type="button"
        className="nh-cell__delete"
        aria-label={t('Delete widget')}
        title={t('Delete widget')}
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
