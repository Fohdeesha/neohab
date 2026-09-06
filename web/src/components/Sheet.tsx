/**
 * Shared surface for editor UI: a right-side panel on wide screens, a bottom sheet on narrow
 * ones (pure CSS switch). `side=false` forces bottom-sheet presentation at every width
 * (used by pickers that are transient rather than persistent).
 */
import { useEffect, useRef, type ReactNode } from 'react'
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
  /**
   * Scroll the body back to the top whenever this changes. A multi-step sheet keeps one scrolling
   * element across its steps, so the generator's review opened halfway down the list the previous
   * step had been scrolled to.
   */
  scrollResetKey?: string | number
  children: ReactNode
}

/**
 * Every sheet currently on screen, innermost last. Escape closes the one on top and leaves the
 * rest alone, so a settings panel with the palette over it takes two presses rather than losing
 * both at once.
 */
const openSheets: { close: () => void }[] = []

/** Whether any sheet is open, for handlers that must not also act on the Escape it consumed. */
export function anySheetOpen(): boolean {
  return openSheets.length > 0
}

export function Sheet({ title, onClose, side = false, collapsed = false, scrollResetKey, children }: SheetProps) {
  const { t } = useTranslation()
  const bodyRef = useRef<HTMLDivElement>(null)

  // Escape closes it, like every other dialog. Registered once per sheet, so it reads the current
  // onClose rather than the one that existed at mount - these are inline arrows that change every
  // render.
  const latestClose = useRef(onClose)
  latestClose.current = onClose
  useEffect(() => {
    const entry = { close: () => latestClose.current() }
    openSheets.push(entry)
    const onKey = (e: KeyboardEvent) => {
      // An open picker inside the sheet marks the Escape it consumed as handled; closing its list
      // and the sheet around it on one press would take away more than was asked for.
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
  // A bottom sheet spans the viewport, and the sidebar is stacked above it because on a phone it
  // has to overlay everything. On a wide screen with the sidebar pinned that put the sheet's
  // first 260px underneath it: every palette card in the first column could not be pressed,
  // which is how adding one more widget to the palette made the Clock card unclickable. The
  // sheet takes the same inset the dashboard content does, so it starts where the sidebar ends.
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
