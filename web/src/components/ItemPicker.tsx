/**
 * Item picker combobox: a text input with an explicit dropdown button, so it is obvious the
 * item can be chosen from a list rather than typed. Typing filters by name and label;
 * arrow keys navigate, Enter selects, Escape closes.
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

function typeMatches(item: Item, types?: string[]): boolean {
  if (!types || types.length === 0) return true
  const base = item.type === 'Group' ? item.groupType : item.type
  return base !== undefined && types.some((t) => base.startsWith(t))
}

const MAX_RESULTS = 60

export function ItemPicker({ id, value, onChange, itemTypes, placeholder }: ItemPickerProps) {
  const items = useCatalogStore((s) => s.items)
  const loaded = useCatalogStore((s) => s.loaded)
  const [open, setOpen] = useState(false)
  /** Text being typed to filter; null means "display the configured value". */
  const [query, setQuery] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    ensureCatalog()
  }, [])

  // Close when tapping/clicking outside the picker.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(null)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const matches = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    const byType = items.filter((i) => typeMatches(i, itemTypes))
    const filtered = q
      ? byType.filter(
          (i) => i.name.toLowerCase().includes(q) || (i.label ?? '').toLowerCase().includes(q)
        )
      : byType
    return filtered.slice(0, MAX_RESULTS)
  }, [items, itemTypes, query])

  const select = (item: Item) => {
    onChange(item.name)
    setQuery(null)
    setOpen(false)
    inputRef.current?.focus()
  }

  const openList = () => {
    setOpen(true)
    setHighlight(0)
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
      setOpen(false)
      setQuery(null)
    }
  }

  return (
    <div className="nh-picker" ref={rootRef}>
      <div className="nh-picker__box">
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
            openList()
            onChange(e.target.value)
          }}
          onFocus={openList}
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
            if (open) {
              setOpen(false)
              setQuery(null)
            } else {
              openList()
              inputRef.current?.focus()
            }
          }}
        >
          ▾
        </button>
      </div>

      {open ? (
        <ul className="nh-picker__list" id={id + '-list'} role="listbox" ref={listRef}>
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
          {matches.length === 0 ? (
            <li className="nh-picker__empty">{loaded ? 'No matching items' : 'Loading items…'}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
