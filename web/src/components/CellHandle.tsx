/**
 * The chrome strip along the top of every widget cell in edit mode: drag grip, widget type,
 * and a delete button. Shared by both edit surfaces (the wide grid and the phone stack) so a
 * widget offers the same handles wherever it is edited.
 *
 * Deleting is deliberately not confirmed: it only touches the draft, and both undo and Discard
 * bring the widget back.
 */
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
  /** Surfaces this widget is hidden on, marked here so a dimmed cell explains itself. */
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
        // the strip starts a drag on pointerdown; pressing delete must not begin one
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
