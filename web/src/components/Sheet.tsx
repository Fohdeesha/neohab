import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSidebarLayout } from '../store/sidebar'
import { useDialog } from './dialog'

interface SheetProps {
  title: string
  onClose: () => void
  side?: boolean
  /** content that wants room: a grid of cards, a list to review. Ignored below the desktop width. */
  wide?: boolean
  collapsed?: boolean
  scrollResetKey?: string | number
  children: ReactNode
}

export function Sheet({ title, onClose, side = false, wide = false, collapsed = false, scrollResetKey, children }: SheetProps) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useDialog(rootRef, onClose, !side)

  useEffect(() => {
    if (scrollResetKey !== undefined) bodyRef.current?.scrollTo({ top: 0 })
  }, [scrollResetKey])
  // take the same inset the dashboard takes, or a pinned sidebar sits over the first 260px of a bottom
  // sheet. As a custom property rather than `left`, so the stylesheet can still centre the desktop
  // dialog inside whatever room the sidebar leaves.
  const { inset } = useSidebarLayout()
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role={side ? undefined : 'dialog'}
      aria-modal={side ? undefined : true}
      aria-label={title}
      className={
        'nh-sheet' + (side ? ' nh-sheet--side' : '') + (wide && !side ? ' nh-sheet--wide' : '') + (collapsed ? ' nh-sheet--collapsed' : '')
      }
      style={!side && inset > 0 ? ({ '--nh-sheet-inset': inset + 'px' } as CSSProperties) : undefined}>
      <div className="nh-sheet__head">
        <span className="nh-sheet__title">{title}</span>
        <button type="button" className="nh-iconbtn nh-sheet__close" onClick={onClose} aria-label={t('Close')}>
          ×
        </button>
      </div>
      <div className="nh-sheet__body" ref={bodyRef}>
        {children}
      </div>
    </div>
  )
}
