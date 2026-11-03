import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialog } from '../../components/dialog'
import { scrollMoves } from '../../components/popover'
import type { Choice } from '../common/choices'
import { placeMenu, type MenuPlace } from './place'

interface Props {
  choices: Choice[]
  isCurrent: (choice: Choice) => boolean
  /** what the trigger says: the current choice's label, or the raw state when it is none of them */
  shown: string
  disabled: boolean
  onChoose: (command: string) => void
}

const ROW_EM = 2.75
const MIN_WIDTH_EM = 11

export function SelectionDropdown({ choices, isCurrent, shown, disabled, onChoose }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={'nh-selection__select' + (open ? ' nh-selection__select--open' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}>
        {/* every label sits in one grid cell, so the control is as wide as its longest choice and does not
            change width as the choice does */}
        <span className="nh-selection__value">
          {choices.map((c, i) => (
            <span key={i + '|' + c.command} className="nh-selection__sizer" aria-hidden="true">
              {c.label}
            </span>
          ))}
          <span className="nh-selection__current">{shown}</span>
        </span>
        <span className="nh-selection__chev" aria-hidden="true" />
      </button>
      {open && triggerRef.current ? (
        <SelectionMenu
          trigger={triggerRef.current}
          choices={choices}
          isCurrent={isCurrent}
          onClose={() => setOpen(false)}
          onChoose={(command) => {
            setOpen(false)
            onChoose(command)
          }}
        />
      ) : null}
    </>
  )
}

function SelectionMenu({
  trigger,
  choices,
  isCurrent,
  onClose,
  onChoose
}: {
  trigger: HTMLButtonElement
  choices: Choice[]
  isCurrent: (choice: Choice) => boolean
  onClose: () => void
  onChoose: (command: string) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  useDialog(menuRef, onClose, true)

  // the list is drawn in the body, outside the tile, so it takes the tile's text size and accent with it
  const [look] = useState(() => {
    const cs = getComputedStyle(trigger)
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    return {
      font: Math.max(parseFloat(cs.fontSize) || root, root),
      accent: cs.getPropertyValue('--nh-cellaccent').trim(),
      ink: cs.getPropertyValue('--nh-accent-ink').trim()
    }
  })
  const [place, setPlace] = useState<MenuPlace>(() => measure())

  function measure(): MenuPlace {
    const r = trigger.getBoundingClientRect()
    return placeMenu(
      r,
      { width: document.documentElement.clientWidth, height: window.innerHeight },
      { width: MIN_WIDTH_EM * look.font, height: choices.length * ROW_EM * look.font + 12 }
    )
  }

  // the current choice is where the keyboard starts and what the list scrolls to. After useDialog's own
  // effect, which has to see the trigger focused to give focus back to it.
  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const options = [...menu.querySelectorAll<HTMLElement>('[role="option"]')]
    const at = options.find((o) => o.getAttribute('aria-selected') === 'true') ?? options[0]
    at?.focus({ preventScroll: true })
    at?.scrollIntoView({ block: 'nearest' })
  }, [])

  useEffect(() => {
    // only a scroll that moves the control moves the list's anchor; a log tile following its newest line
    // somewhere else on the page must not close it
    const onScroll = (e: Event) => {
      if (scrollMoves(e.target, trigger)) onClose()
    }
    const onResize = () => setPlace(measure())
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  })

  const onKey = (e: React.KeyboardEvent) => {
    const menu = menuRef.current
    if (!menu) return
    const options = [...menu.querySelectorAll<HTMLElement>('[role="option"]')]
    const at = options.indexOf(document.activeElement as HTMLElement)
    const next =
      e.key === 'ArrowDown'
        ? Math.min(options.length - 1, at + 1)
        : e.key === 'ArrowUp'
          ? Math.max(0, at - 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? options.length - 1
              : null
    if (next === null) return
    e.preventDefault()
    options[next]?.focus()
  }

  return createPortal(
    // a press in here must not start the tile's own hold, and React carries it to the tile through the portal
    <div className="nh-selection__layer" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      {/* closes on the click rather than the press: a touch click lands where the finger lifts, and with the
          backdrop already gone it would land on whatever tile is under it */}
      <div className="nh-selection__backdrop" onClick={onClose} />
      <div
        ref={menuRef}
        className="nh-selection__menu"
        role="listbox"
        tabIndex={-1}
        onKeyDown={onKey}
        style={
          {
            left: place.left,
            width: place.width,
            top: place.top,
            bottom: place.bottom,
            maxHeight: place.maxHeight,
            fontSize: look.font,
            '--nh-cellaccent': look.accent || undefined,
            '--nh-accent-ink': look.ink || undefined
          } as React.CSSProperties
        }>
        {choices.map((c, i) => {
          const on = isCurrent(c)
          return (
            <button
              key={i + '|' + c.command}
              type="button"
              role="option"
              aria-selected={on}
              className={'nh-selection__opt' + (on ? ' nh-selection__opt--on' : '')}
              onClick={() => onChoose(c.command)}>
              <span className="nh-selection__optlabel">{c.label}</span>
              <span className="nh-selection__tick" aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  )
}
