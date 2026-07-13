/**
 * Icon picker: a text field (free text allowed, e.g. custom iconset names) with a browsable
 * popover offering both icon sources - the bundled Material Design Icons library (searchable
 * ~7k set) and the openHAB server's classic icon set (state-aware). Same fixed-position,
 * viewport-sized popover pattern as the item picker.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { CLASSIC_ICONS } from './classicIcons'

interface IconPickerProps {
  id: string
  value: string
  onChange: (icon: string) => void
}

type Tab = 'mdi' | 'oh'

interface MdiEntry {
  name: string
  search: string
}

let mdiIndex: MdiEntry[] | null = null
let mdiIndexPromise: Promise<MdiEntry[]> | null = null

function loadMdiIndex(): Promise<MdiEntry[]> {
  mdiIndexPromise ??= fetch('icons/mdi-index.json')
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.reject(new Error(String(r.status)))))
    .then((list) => {
      mdiIndex = list.map((row) => {
        const pipe = row.indexOf('|')
        const name = pipe === -1 ? row : row.slice(0, pipe)
        return { name, search: pipe === -1 ? name : name + ' ' + row.slice(pipe + 1) }
      })
      return mdiIndex
    })
  return mdiIndexPromise
}

const MAX_RESULTS = 120
const MARGIN = 8

interface ListPos {
  left: number
  width: number
  top?: number
  bottom?: number
  maxHeight: number
}

export function IconPicker({ id, value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>(value.startsWith('oh:') ? 'oh' : 'mdi')
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<ListPos | null>(null)
  const [mdiReady, setMdiReady] = useState(mdiIndex !== null)
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && !mdiIndex) {
      void loadMdiIndex().then(() => setMdiReady(true)).catch(() => setMdiReady(false))
    }
  }, [open])

  const openList = () => {
    const box = boxRef.current?.getBoundingClientRect()
    if (box) {
      const below = window.innerHeight - box.bottom - MARGIN
      const above = box.top - MARGIN
      const flip = below < 300 && above > below
      const maxHeight = Math.max(220, flip ? above : below)
      setPos(
        flip
          ? { left: box.left, width: Math.max(box.width, 300), bottom: window.innerHeight - box.top + 4, maxHeight }
          : { left: box.left, width: Math.max(box.width, 300), top: box.bottom + 4, maxHeight }
      )
    }
    setOpen(true)
  }
  const close = () => {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !popRef.current?.contains(t)) close()
    }
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return
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
    const q = query.trim().toLowerCase()
    if (tab === 'oh') {
      const filtered = q ? CLASSIC_ICONS.filter((n) => n.includes(q)) : CLASSIC_ICONS
      return { matches: filtered.slice(0, MAX_RESULTS), truncated: Math.max(0, filtered.length - MAX_RESULTS) }
    }
    const list = mdiIndex ?? []
    const filtered = q ? list.filter((e) => e.search.includes(q)) : list
    return {
      matches: filtered.slice(0, MAX_RESULTS).map((e) => e.name),
      truncated: Math.max(0, filtered.length - MAX_RESULTS),
    }
  }, [tab, query, mdiReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (name: string) => {
    onChange(tab === 'mdi' ? 'mdi:' + name : 'oh:' + name)
    close()
  }

  return (
    <div className="nh-picker" ref={rootRef}>
      <div className="nh-picker__box" ref={boxRef}>
        {value ? (
          <span className="nh-iconpicker__preview">
            <Icon icon={value} size={22} />
          </span>
        ) : null}
        <input
          id={id}
          type="text"
          autoComplete="off"
          placeholder="No icon — browse or type mdi:name / oh:name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={openList}
        />
        <button
          type="button"
          className={'nh-picker__toggle' + (open ? ' nh-picker__toggle--open' : '')}
          aria-label={open ? 'Close icon list' : 'Browse icons'}
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault()
            if (open) close()
            else openList()
          }}
        >
          ▾
        </button>
      </div>

      {open && pos ? (
        <div
          className="nh-iconpicker__pop"
          ref={popRef}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
        >
          <div className="nh-iconpicker__tabs">
            <button
              type="button"
              className={'nh-iconpicker__tab' + (tab === 'mdi' ? ' nh-iconpicker__tab--on' : '')}
              onClick={() => setTab('mdi')}
            >
              Icon library
            </button>
            <button
              type="button"
              className={'nh-iconpicker__tab' + (tab === 'oh' ? ' nh-iconpicker__tab--on' : '')}
              onClick={() => setTab('oh')}
            >
              openHAB
            </button>
            {value ? (
              <button type="button" className="nh-iconpicker__clear" onClick={() => { onChange(''); close() }}>
                Remove icon
              </button>
            ) : null}
          </div>
          <input
            type="text"
            className="nh-iconpicker__search"
            placeholder={tab === 'mdi' ? 'Search ~7,000 icons…' : 'Search the classic set…'}
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && close()}
          />
          <div className="nh-iconpicker__grid">
            {tab === 'mdi' && !mdiReady ? <span className="nh-picker__empty">Loading icon library…</span> : null}
            {matches.map((name) => (
              <button
                key={name}
                type="button"
                className="nh-iconpicker__cell"
                title={name}
                onClick={() => select(name)}
              >
                <Icon icon={(tab === 'mdi' ? 'mdi:' : 'oh:') + name} size={26} />
              </button>
            ))}
            {matches.length === 0 && (tab === 'oh' || mdiReady) ? (
              <span className="nh-picker__empty">No matching icons</span>
            ) : null}
          </div>
          {truncated > 0 ? (
            <div className="nh-iconpicker__more">…and {truncated} more — type to narrow</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
