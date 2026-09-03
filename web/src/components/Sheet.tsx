/**
 * Shared surface for editor UI: a right-side panel on wide screens, a bottom sheet on narrow
 * ones (pure CSS switch). `side=false` forces bottom-sheet presentation at every width
 * (used by pickers that are transient rather than persistent).
 */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSidebarLayout } from '../store/sidebar'

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
  // A bottom sheet spans the viewport, and the sidebar is stacked above it because on a phone it
  // has to overlay everything. On a wide screen with the sidebar pinned that put the sheet's
  // first 260px underneath it: every palette card in the first column could not be pressed,
  // which is how adding one more widget to the palette made the Clock card unclickable. The
  // sheet takes the same inset the dashboard content does, so it starts where the sidebar ends.
  const { inset } = useSidebarLayout()
  return (
    <div
      className={'nh-sheet' + (side ? ' nh-sheet--side' : '') + (collapsed ? ' nh-sheet--collapsed' : '')}
      style={!side && inset > 0 ? { left: inset } : undefined}
    >
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
