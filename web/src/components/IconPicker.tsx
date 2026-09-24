import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './Icon'
import { CLASSIC_ICONS } from './classicIcons'
import { saveCustomIcon, useConfigStore } from '../store/config'
import { slugifyIconId } from '../model/customIcon'
import { DEFAULT_MAX_ICON_KB, processIconFile } from './iconUpload'
import { scrollMoves } from './popover'
import { errorText } from '../api/errors'

interface IconPickerProps {
  id: string
  value: string
  onChange: (icon: string) => void
}

type Tab = 'all' | 'color' | 'mono' | 'weather' | 'oh' | 'custom'

interface PackEntry {
  ref: string
  label: string
  search: string
}

const COLOR_PACKS: [file: string, prefix: string][] = [
  ['fluent-index.json', 'fluent'],
  ['fc-index.json', 'fc']
]
const MONO_PACKS: [file: string, prefix: string][] = [['mdi-index.json', 'mdi']]
const WEATHER_PACKS: [file: string, prefix: string][] = [['meteo-index.json', 'meteo']]

const TAB_PACKS: Partial<Record<Tab, [file: string, prefix: string][]>> = {
  all: [...COLOR_PACKS, ...WEATHER_PACKS, ...MONO_PACKS],
  color: COLOR_PACKS,
  mono: MONO_PACKS,
  weather: WEATHER_PACKS
}

const TAB_LABELS: Record<Tab, string> = {
  all: 'All',
  color: 'Color',
  mono: 'Mono',
  weather: 'Weather',
  oh: 'openHAB',
  custom: 'Custom'
}

const SEARCH_HINTS: Record<Tab, string> = {
  all: 'Search every icon set…',
  color: 'Search ~1,900 color icons…',
  mono: 'Search ~7,000 icons…',
  weather: 'Search ~450 weather icons…',
  oh: 'Search the classic set…',
  custom: 'Search your icons…'
}

// built once: 100-odd names that never change, rebuilt per keystroke otherwise
const CLASSIC_ENTRIES: PackEntry[] = CLASSIC_ICONS.map((n) => ({ ref: 'oh:' + n, label: n, search: n }))

const loadedIndexes = new Map<string, PackEntry[]>()
const indexPromises = new Map<string, Promise<void>>()
// a failed read is forgotten, so opening the picker again asks again instead of "loading" for ever
const failedIndexes = new Set<string>()

function loadIndex(file: string, prefix: string): Promise<void> {
  let p = indexPromises.get(file)
  if (!p) {
    failedIndexes.delete(file)
    p = fetch('icons/' + file)
      .then((r) => (r.ok ? (r.json() as Promise<string[]>) : Promise.reject(new Error(String(r.status)))))
      .then((rows) => {
        loadedIndexes.set(
          file,
          rows.map((row) => {
            const pipe = row.indexOf('|')
            const name = pipe === -1 ? row : row.slice(0, pipe)
            return {
              ref: prefix + ':' + name,
              label: name,
              search: pipe === -1 ? name : name + ' ' + row.slice(pipe + 1)
            }
          })
        )
      })
      .catch((err: unknown) => {
        indexPromises.delete(file)
        failedIndexes.add(file)
        throw err
      })
    indexPromises.set(file, p)
  }
  return p
}

// merged once per set of packs: sorting ~1,900 names with localeCompare on every keystroke was the cost
const mergedPacks = new Map<string, PackEntry[]>()

const packEntries = (packs: [file: string, prefix: string][], sorted: boolean): PackEntry[] => {
  const key = packs.map(([file]) => file).join('|') + (sorted ? '|sorted' : '')
  const complete = packs.every(([file]) => loadedIndexes.has(file))
  const cached = complete ? mergedPacks.get(key) : undefined
  if (cached) return cached
  const entries = packs.flatMap(([file]) => loadedIndexes.get(file) ?? [])
  // two packs in one tab interleave by name; one pack keeps the order it was built in
  const out = sorted && entries.length > 0 && packs.length > 1 ? [...entries].sort((a, b) => a.label.localeCompare(b.label)) : entries
  if (complete) mergedPacks.set(key, out)
  return out
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // every set at once, so typing a word finds it wherever it lives. The tabs narrow from here.
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<ListPos | null>(null)
  const [loadTick, setLoadTick] = useState(0)
  const [retry, setRetry] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const customIcons = useConfigStore((s) => s.customIcons)

  useEffect(() => {
    if (!open) return
    const packs = TAB_PACKS[tab]
    if (!packs || packs.every(([file]) => loadedIndexes.has(file))) return
    let cancelled = false
    void Promise.allSettled(packs.map(([file, prefix]) => loadIndex(file, prefix))).then(() => {
      if (!cancelled) setLoadTick((t) => t + 1)
    })
    return () => {
      cancelled = true
    }
  }, [open, tab, retry])

  const openedAt = useRef(0)
  const placeList = () => {
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
  }
  const openList = () => {
    placeList()
    setOpen(true)
    openedAt.current = Date.now()
  }
  const close = () => {
    setOpen(false)
    setQuery('')
    setUploadError(null)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!rootRef.current?.contains(t) && !popRef.current?.contains(t)) close()
    }
    const onScroll = (e: Event) => {
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return
      if (!scrollMoves(e.target, rootRef.current)) return
      // the focus-follow scroll of a just-tapped input is part of opening the popover, not the user scrolling away
      if (Date.now() - openedAt.current < 300) {
        placeList()
        return
      }
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

  const packs = TAB_PACKS[tab]
  const packsReady = !packs || packs.every(([file]) => loadedIndexes.has(file))
  const packsFailed = !packsReady && (packs ?? []).some(([file]) => failedIndexes.has(file))

  const { matches, truncated } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const mine = customIcons.map((i) => ({ ref: 'custom:' + i.id, label: i.name, search: i.name + ' ' + i.id }))
    let entries: PackEntry[]
    if (tab === 'oh') entries = CLASSIC_ENTRIES
    else if (tab === 'custom') entries = mine
    else if (tab === 'all') {
      // your own first because there are few of them and they are yours, then the sets, with the
      // 7,000-entry mono one last so it cannot bury everything behind it. Not sorted across the
      // whole lot: collating 9,000 names with localeCompare costs most of a second per keystroke.
      entries = [
        ...mine,
        ...packEntries(COLOR_PACKS, true),
        ...packEntries(WEATHER_PACKS, false),
        ...CLASSIC_ENTRIES,
        ...packEntries(MONO_PACKS, false)
      ]
    } else entries = packEntries(TAB_PACKS[tab] ?? [], true)
    const filtered = q ? entries.filter((e) => e.search.includes(q)) : entries
    return { matches: filtered.slice(0, MAX_RESULTS), truncated: Math.max(0, filtered.length - MAX_RESULTS) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, query, loadTick, customIcons])

  const select = (ref: string) => {
    onChange(ref)
    close()
  }

  const upload = async (file: File) => {
    setUploadError(null)
    setUploading(true)
    try {
      const state = useConfigStore.getState()
      const maxKB = state.settings.maxIconKB ?? DEFAULT_MAX_ICON_KB
      const processed = await processIconFile(file, maxKB)
      const name = file.name.replace(/\.[^.]+$/, '') || 'icon'
      const idSlug = slugifyIconId(name, new Set(state.customIcons.map((i) => i.id)))
      await saveCustomIcon({ version: 1, id: idSlug, name, ...processed })
      select('custom:' + idSlug)
    } catch (err) {
      setUploadError(errorText(err))
    } finally {
      setUploading(false)
    }
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
          placeholder={t('No icon - browse or type mdi:name / oh:name')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={openList}
        />
        <button
          type="button"
          className={'nh-picker__toggle' + (open ? ' nh-picker__toggle--open' : '')}
          aria-label={open ? t('Close icon list') : t('Browse icons')}
          tabIndex={-1}
          onPointerDown={(e) => {
            e.preventDefault()
            if (open) close()
            else openList()
          }}>
          ▾
        </button>
      </div>

      {open && pos ? (
        <div
          className="nh-iconpicker__pop"
          ref={popRef}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}>
          <div className="nh-iconpicker__tabs">
            {(Object.keys(TAB_LABELS) as Tab[]).map((tb) => (
              <button
                key={tb}
                type="button"
                className={'nh-iconpicker__tab' + (tab === tb ? ' nh-iconpicker__tab--on' : '')}
                onClick={() => setTab(tb)}>
                {t(TAB_LABELS[tb])}
              </button>
            ))}
            {value ? (
              <button
                type="button"
                className="nh-iconpicker__clear"
                onClick={() => {
                  onChange('')
                  close()
                }}>
                {t('Remove icon')}
              </button>
            ) : null}
          </div>
          <input
            type="text"
            className="nh-iconpicker__search"
            placeholder={t(SEARCH_HINTS[tab])}
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.preventDefault()
              close()
            }}
          />
          {tab === 'custom' ? (
            <div className="nh-iconpicker__upload">
              <button type="button" className="nh-btn nh-btn--ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? t('Uploading…') : t('Upload icon…')}
              </button>
              <span className="nh-iconpicker__uploadhint">{t('PNG, JPG, GIF, WebP, BMP or SVG')}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.svg,.png,.jpg,.jpeg,.gif,.webp,.bmp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void upload(file)
                }}
              />
            </div>
          ) : null}
          {uploadError ? <div className="nh-iconpicker__error">{uploadError}</div> : null}
          <div className="nh-iconpicker__grid">
            {packsFailed ? (
              <span className="nh-picker__empty">
                {t('The icon library could not be loaded.')}{' '}
                <button type="button" className="nh-report__link" onClick={() => setRetry((n) => n + 1)}>
                  {t('Try again')}
                </button>
              </span>
            ) : !packsReady ? (
              <span className="nh-picker__empty">{t('Loading icon library…')}</span>
            ) : null}
            {matches.map((entry) => (
              <button key={entry.ref} type="button" className="nh-iconpicker__cell" title={entry.ref} onClick={() => select(entry.ref)}>
                <Icon icon={entry.ref} size={26} />
              </button>
            ))}
            {matches.length === 0 && packsReady ? (
              <span className="nh-picker__empty">
                {tab === 'custom' && customIcons.length === 0 ? t('No custom icons yet - upload one above') : t('No matching icons')}
              </span>
            ) : null}
          </div>
          {truncated > 0 ? (
            <div className="nh-iconpicker__more">{t('…and {{count}} more - type to narrow', { count: truncated })}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
