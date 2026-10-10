import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { errorText } from '../../api/errors'
import { getItemStateText } from '../../api/items'
import { refreshMs } from '../../model/interval'
import { mixedContent, safeUrl } from '../../model/url'
import {
  backgroundOf,
  cacheBustOf,
  fitOf,
  latestReader,
  pictureOf,
  sourceOf,
  withCacheBust,
  type ImageConfig,
  type LatestReader
} from './model'

function useRefreshStamp(period: number | null): number {
  const [stamp, setStamp] = useState(0)
  useEffect(() => {
    if (period === null) return
    const id = setInterval(() => setStamp(Date.now()), period)
    return () => clearInterval(id)
  }, [period])
  return stamp
}

interface Held {
  name: string
  value?: string
  error?: unknown
}

// a read that failed is tried again on its own, so a wall panel whose picture had a bad moment does not keep
// the message until somebody reloads it
const RETRY_MS = 15_000

// `delivered` is the item's state object: the stream sends a new one for every change, and two pictures of
// the same size arrive as the same text, so the object is the only signal there was a change at all
function useHeldPicture(name: string, delivered: unknown, stamp: number): Held {
  const [held, setHeld] = useState<Held>({ name: '' })
  const reader = useRef<LatestReader | null>(null)

  useEffect(() => {
    if (!name) return
    const r = latestReader(
      (signal) => getItemStateText(name, signal),
      (result) =>
        setHeld(
          result.ok ? { name, value: typeof result.value === 'string' ? result.value : '' } : { name, error: result.error ?? 'failed' }
        )
    )
    reader.current = r
    return () => {
      r.dispose()
      reader.current = null
      setHeld({ name: '' })
    }
  }, [name])

  useEffect(() => {
    if (name) reader.current?.request()
  }, [name, delivered, stamp])

  const failed = held.name === name && held.error !== undefined
  useEffect(() => {
    if (!failed) return
    const id = setTimeout(() => reader.current?.request(), RETRY_MS)
    return () => clearTimeout(id)
  }, [failed, held])

  return held.name === name ? held : { name }
}

function ImageWidget({ config, ctx }: WidgetProps<ImageConfig>) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)

  const fromItem = sourceOf(config) === 'item'
  const itemName = fromItem && typeof config.item === 'string' ? config.item : ''
  const delivered = itemName ? ctx.getItem(itemName) : undefined
  const picture = fromItem ? pictureOf(delivered) : undefined
  const stamp = useRefreshStamp(refreshMs(config.refresh))
  const held = useHeldPicture(picture?.kind === 'held' ? itemName : '', delivered, stamp)
  const cacheBust = cacheBustOf(config)

  let raw = ''
  if (!fromItem) raw = typeof config.url === 'string' ? config.url : ''
  else if (picture?.kind === 'address') raw = picture.url
  else if (picture?.kind === 'held' && held.value !== undefined) raw = held.value

  // the stream can still hold the last state when the item was read, so a read can find it emptied since
  const heldEmpty = picture?.kind === 'held' && (held.value === 'NULL' || held.value === 'UNDEF')
  const isHeld = picture?.kind === 'held'
  const url = isHeld ? (/^data:image\//i.test(raw) ? raw : null) : safeUrl(raw)
  const src = url === null ? '' : isHeld || !cacheBust ? url : withCacheBust(url, stamp)

  // a new picture, or the next refresh, is a fresh try: a camera snapshot that 404s once should not leave
  // the tile saying so for ever
  useEffect(() => setFailed(false), [src, stamp])

  const message = (text: string) => (
    <WidgetFrame label={config.label} center>
      <span className="nh-image__placeholder">{text}</span>
    </WidgetFrame>
  )

  if (fromItem) {
    if (!picture) return message('')
    if (picture.kind === 'none' || heldEmpty) return message(t('This item has no image yet.'))
    if (isHeld) {
      if (held.error !== undefined) return message(t('Could not read the image from openHAB: {{error}}', { error: errorText(held.error) }))
      if (held.value === undefined) return message(t('Loading…'))
      if (!url || failed) return message(t('This item does not hold an image that can be shown.'))
    }
  }

  if (!url) {
    if (fromItem) return message(t('That image address cannot be shown.'))
    return message(raw ? t('That image address cannot be shown.') : t('No image URL'))
  }

  if (mixedContent(url)) {
    return message(t('This page is served over HTTPS, so it cannot load an image from an insecure http:// address.'))
  }

  if (failed) return message(t('That image could not be loaded. Check the address and that the host is reachable.'))

  const background = backgroundOf(config)
  return (
    <WidgetFrame label={config.label} bare>
      {/* without the timestamp a refresh can only hand the browser a new element at the same address,
          which is all HABPanel's "no cache busting" ever did */}
      <img
        key={cacheBust || isHeld ? 'img' : stamp}
        className={fitOf(config) === 'contain' ? 'nh-image nh-image--contain' : 'nh-image'}
        style={background ? { backgroundColor: background } : undefined}
        src={src}
        alt={config.label ?? ''}
        onError={() => setFailed(true)}
      />
    </WidgetFrame>
  )
}

const usesItem = (c: { source?: unknown }) => sourceOf(c) === 'item'

export const imageWidget: WidgetDefinition<ImageConfig> = {
  type: 'image',
  name: 'Image',
  description: 'Show an image or camera snapshot',
  defaultSize: { w: 6, h: 4 },
  hasHeader: true,
  defaultConfig: () => ({ source: 'url', url: '', refresh: 0, cacheBust: true, fit: 'cover' }),
  settings: [
    {
      key: 'source',
      type: 'select',
      label: 'Image source',
      options: [
        { value: 'url', label: 'Image URL' },
        { value: 'item', label: 'openHAB Item' }
      ]
    },
    { key: 'url', type: 'text', label: 'Image URL', placeholder: 'https://…', subresource: true, showIf: (c) => !usesItem(c) },
    {
      key: 'item',
      type: 'item',
      label: 'openHAB Item',
      itemTypes: ['Image', 'String'],
      readOnly: true,
      showIf: usesItem,
      hint: 'An Image item shows the picture it holds. A String item is read as the address of one.'
    },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'refresh', type: 'number', label: 'Refresh (seconds)', min: 0 },
    {
      key: 'cacheBust',
      type: 'boolean',
      label: 'Add a timestamp to the address when refreshing',
      hint: 'Without it the browser may keep showing the picture it already has. Turn it off only for a camera that refuses an address it does not recognise.',
      showIf: (c) => refreshMs(c.refresh) !== null
    },
    {
      key: 'fit',
      type: 'select',
      label: 'Scaling',
      options: [
        { value: 'contain', label: 'Fit (show the whole picture)' },
        { value: 'cover', label: 'Fill (crop to the cell)' }
      ]
    },
    { key: 'background', type: 'color', label: 'Background' }
  ],
  itemKeys: (c) => (usesItem(c) && typeof c.item === 'string' ? [c.item] : []),
  canCommand: () => false,
  controlFor: () => undefined,
  Component: ImageWidget
}
