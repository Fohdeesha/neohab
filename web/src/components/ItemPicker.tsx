/**
 * Item picker combobox: a text input with an explicit dropdown button, so it is obvious the
 * item can be chosen from a list rather than typed. Typing filters by name and label;
 * arrow keys navigate, Enter selects, Escape closes.
 *
 * The list is rendered position:fixed and sized to the space available in the viewport
 * (rather than a small fixed height) so long item lists are comfortable to scan, and it
 * escapes any scrolling/clipping ancestor such as the settings sheet.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Item } from '../api/types'
import { ensureCatalog, useCatalogStore } from '../store/catalog'

interface ItemPickerProps {
  id: string
  value: string
  onChange: (itemName: string) => void
  /** Restrict to these item types (a typed Group matches via its base type). */
  itemTypes?: string[]
  placeholder?: string
}

interface ListPos {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

function typeMatches(item: Item, types?: string[]): boolean {
  if (!types || types.length === 0) return true
  const base = item.type === 'Group' ? item.groupType : item.type
  return base !== undefined && types.some((t) => base.startsWith(t))
}

const MAX_RESULTS = 200
const MARGIN = 8

export function ItemPicker({ id, value, onChange, itemTypes, placeholder }: ItemPickerProps) {
  const items = useCatalogStore((s) => s.items)
  const loaded = useCatalogStore((s) => s.loaded)
  const [open, setOpen] = useState(false)
  /** Text being typed to filter; null means "display the configured value". */
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const [pos, setPos] = useState<ListPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    ensureCatalog()
  }, [])

  const close = () => {
    setOpen(false)
    setQuery(null)
  }

  const openList = () => {
    const box = boxRef.current?.getBoundingClientRect()
    if (box) {
      const below = window.innerHeight - box.bottom - MARGIN
      const above = box.top - MARGIN
      // Open downward unless there is clearly more room above.
      const flip = below < 260 && above > below
      const maxHeight = Math.max(180, flip ? above : below)
      setPos(
        flip
          ? { left: box.left, width: box.width, bottom: window.innerHeight - box.top + 4, maxHeight }
          : { left: box.left, width: box.width, top: box.bottom + 4, maxHeight }
      )
    }
    setOpen(true)
    setHighlight(0)
  }

  // Close when tapping outside, scrolling elsewhere, or resizing (the fixed position
  // would otherwise go stale).
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) close()
    }
    const onScroll = (e: Event) => {
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return
      close()
    }
    const onResize = () => close()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const { matches, truncated } = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    const byType = items.filter((i) => typeMatches(i, itemTypes))
    const filtered = q
      ? byType.filter(
          (i) => i.name.toLowerCase().includes(q) || (i.label ?? '').toLowerCase().includes(q)
        )
      : byType
    return { matches: filtered.slice(0, MAX_RESULTS), truncated: filtered.length - MAX_RESULTS }
  }, [items, itemTypes, query])

  /** True while select() restores focus, so onFocus doesn't reopen the list it just closed. */
  const restoringFocus = useRef(false)

  const select = (item: Item) => {
    onChange(item.name)
    close()
    // Clicking an option blurs the input, so focus has to be put back for keyboard flow - but
    // that fires onFocus, which would reopen the list. focus() dispatches synchronously, so the
    // guard is set and cleared around it (and clears itself if no event fires at all).
    restoringFocus.current = true
    inputRef.current?.focus()
    restoringFocus.current = false
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault()
      openList()
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? highlight + 1 : highlight - 1
      const clamped = Math.max(0, Math.min(next, matches.length - 1))
      setHighlight(clamped)
      listRef.current?.children[clamped]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = matches[highlight]
      if (item) select(item)
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <div className="nh-picker" ref={rootRef}>
      <div className="nh-picker__box" ref={boxRef}>
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={id + '-list'}
          autoComplete="off"
          value={query ?? value}
          placeholder={placeholder ?? 'Search or pick an item…'}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) openList()
            setHighlight(0)
            onChange(e.target.value)
          }}
          onFocus={() => {
            if (!restoringFocus.current) openList()
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={'nh-picker__toggle' + (open ? ' nh-picker__toggle--open' : '')}
          aria-label={open ? 'Close item list' : 'Show item list'}
          tabIndex={-1}
          onPointerDown={(e) => {
            // pointerdown (not click) so the outside-close handler doesn't race us
            e.preventDefault()
            if (open) close()
            else {
              openList()
              inputRef.current?.focus()
            }
          }}
        >
          ▾
        </button>
      </div>

      {open && pos ? (
        <ul
          className="nh-picker__list"
          id={id + '-list'}
          role="listbox"
          ref={listRef}
          style={{
            left: pos.left,
            width: pos.width,
            top: pos.top,
            bottom: pos.bottom,
            maxHeight: pos.maxHeight,
          }}
        >
          {matches.map((item, i) => (
            <li
              key={item.name}
              role="option"
              aria-selected={item.name === value}
              className={
                'nh-picker__option' +
                (i === highlight ? ' nh-picker__option--hi' : '') +
                (item.name === value ? ' nh-picker__option--current' : '')
              }
              onPointerEnter={() => setHighlight(i)}
              onClick={() => select(item)}
            >
              <span className="nh-picker__name">{item.name}</span>
              <span className="nh-picker__meta">
                {item.label ? item.label + ' · ' : ''}
                {item.type === 'Group' && item.groupType ? `Group:${item.groupType}` : item.type}
              </span>
            </li>
          ))}
          {truncated > 0 ? (
            <li className="nh-picker__empty">…and {truncated} more — type to narrow the list</li>
          ) : null}
          {matches.length === 0 ? (
            <li className="nh-picker__empty">{loaded ? 'No matching items' : 'Loading items…'}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
