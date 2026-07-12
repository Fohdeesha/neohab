/**
 * Shared surface for editor UI: a right-side panel on wide screens, a bottom sheet on narrow
 * ones (pure CSS switch). `side=false` forces bottom-sheet presentation at every width
 * (used by pickers that are transient rather than persistent).
 */
import type { ReactNode } from 'react'

interface SheetProps {
  title: string
  onClose: () => void
  side?: boolean
  children: ReactNode
}

export function Sheet({ title, onClose, side = false, children }: SheetProps) {
  return (
    <div className={'nh-sheet' + (side ? ' nh-sheet--side' : '')}>
      <div className="nh-sheet__head">
        <span className="nh-sheet__title">{title}</span>
        <button type="button" className="nh-iconbtn nh-sheet__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="nh-sheet__body">{children}</div>
    </div>
  )
}
