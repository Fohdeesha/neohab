import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSidebarLayout } from '../store/sidebar'

interface SheetProps {
  title: string
  onClose: () => void
  side?: boolean
  collapsed?: boolean
  scrollResetKey?: string | number
  children: ReactNode
}

// innermost last, so Escape closes one sheet at a time
const openSheets: { close: () => void }[] = []

export function anySheetOpen(): boolean {
  return openSheets.length > 0
}

export function Sheet({ title, onClose, side = false, collapsed = false, scrollResetKey, children }: SheetProps) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)

  const latestClose = useRef(onClose)
  latestClose.current = onClose
  useEffect(() => {
    const entry = { close: () => latestClose.current() }
    openSheets.push(entry)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (openSheets[openSheets.length - 1] !== entry) return
      e.preventDefault()
      entry.close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      const at = openSheets.indexOf(entry)
      if (at >= 0) openSheets.splice(at, 1)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (scrollResetKey !== undefined) bodyRef.current?.scrollTo({ top: 0 })
  }, [scrollResetKey])
  // take the same inset the dashboard takes, or a pinned sidebar sits over the first 260px of a bottom sheet
  const { inset } = useSidebarLayout()
  return (
    <div
      className={'nh-sheet' + (side ? ' nh-sheet--side' : '') + (collapsed ? ' nh-sheet--collapsed' : '')}
      style={!side && inset > 0 ? { left: inset } : undefined}>
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
