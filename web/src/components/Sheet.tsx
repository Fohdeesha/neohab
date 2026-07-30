/**
 * Shared surface for editor UI: a right-side panel on wide screens, a bottom sheet on narrow
 * ones (pure CSS switch). `side=false` forces bottom-sheet presentation at every width
 * (used by pickers that are transient rather than persistent).
 */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface SheetProps {
  title: string
  onClose: () => void
  side?: boolean
  /**
   * Fade the sheet out of the way and stop it taking pointer events, without unmounting it - the
   * palette does this while a card is being dragged onto the grid it would otherwise cover.
   */
  collapsed?: boolean
  children: ReactNode
}

export function Sheet({ title, onClose, side = false, collapsed = false, children }: SheetProps) {
  const { t } = useTranslation()
  return (
    <div className={'nh-sheet' + (side ? ' nh-sheet--side' : '') + (collapsed ? ' nh-sheet--collapsed' : '')}>
      <div className="nh-sheet__head">
        <span className="nh-sheet__title">{title}</span>
        <button type="button" className="nh-iconbtn nh-sheet__close" onClick={onClose} aria-label={t('Close')}>
          ×
        </button>
      </div>
      <div className="nh-sheet__body">{children}</div>
    </div>
  )
}
