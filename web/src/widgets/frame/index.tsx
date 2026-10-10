import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { useRefreshStamp } from '../common/useRefreshStamp'
import { refreshMs } from '../../model/interval'
import { mixedContent, safeUrl } from '../../model/url'
import { backgroundOf, cacheBustOf, pictureOf, sourceOf, withCacheBust } from '../image/model'
import { sandboxFor, type FrameConfig } from './model'

function FrameWidget({ config, ctx }: WidgetProps<FrameConfig>) {
  const { t } = useTranslation()
  const stamp = useRefreshStamp(refreshMs(config.refresh))

  const fromItem = sourceOf(config) === 'item'
  const itemName = fromItem && typeof config.item === 'string' ? config.item : ''
  const address = fromItem ? pictureOf(itemName ? ctx.getItem(itemName) : undefined) : undefined

  const message = (text: string) => (
    <WidgetFrame label={config.label} center>
      <span className="nh-image__placeholder">{text}</span>
    </WidgetFrame>
  )

  if (fromItem) {
    if (!address) return message('')
    if (address.kind === 'none') return message(t('This item has no address yet.'))
    if (address.kind === 'held') return message(t('This item holds a picture, not a page address.'))
  }

  const raw = address?.kind === 'address' ? address.url : typeof config.url === 'string' ? config.url : ''
  const url = safeUrl(raw)
  if (!url) return message(raw ? t('That page address cannot be embedded.') : t('No URL configured'))

  if (mixedContent(url)) return message(t('This page is served over HTTPS, so it cannot embed an insecure http:// address.'))

  const sandboxed = sandboxFor(config, url)
  const src = cacheBustOf(config) ? withCacheBust(url, stamp) : url
  const background = backgroundOf(config)

  return (
    <WidgetFrame label={config.label} bare>
      {/* a new frame for every load: a loaded frame sent somewhere else adds a step to the browser's Back, and
          its sandbox attribute only takes effect on load */}
      <iframe
        key={`${stamp}|${sandboxed}|${src}`}
        className="nh-frame"
        src={src}
        title={config.label || t('Embedded page')}
        sandbox={sandboxed ? 'allow-scripts' : undefined}
        style={background ? { backgroundColor: background } : undefined}
      />
    </WidgetFrame>
  )
}

const usesItem = (c: { source?: unknown }) => sourceOf(c) === 'item'

export const frameWidget: WidgetDefinition<FrameConfig> = {
  type: 'frame',
  name: 'Frame',
  description: 'Embed a web page',
  defaultSize: { w: 6, h: 5 },
  hasHeader: true,
  defaultConfig: () => ({ source: 'url', url: '', refresh: 0, cacheBust: true, sandbox: false }),
  settings: [
    {
      key: 'source',
      type: 'select',
      label: 'Page source',
      options: [
        { value: 'url', label: 'Page URL' },
        { value: 'item', label: 'openHAB Item' }
      ]
    },
    { key: 'url', type: 'text', label: 'Page URL', placeholder: 'https://…', subresource: true, showIf: (c) => !usesItem(c) },
    {
      key: 'item',
      type: 'item',
      label: 'openHAB Item',
      itemTypes: ['String'],
      readOnly: true,
      showIf: usesItem,
      hint: 'The item holds the page address. That page always runs sandboxed, since anyone who can change the item can choose it: it cannot reach openHAB or store anything, so openHAB’s own UIs and many web apps will not work in it.'
    },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'refresh', type: 'number', label: 'Reload (seconds)', min: 0 },
    {
      key: 'cacheBust',
      type: 'boolean',
      label: 'Add a timestamp to the address when refreshing',
      hint: 'Without it the browser may keep showing the page it already has. Turn it off only for a page that refuses an address it does not recognise.',
      showIf: (c) => refreshMs(c.refresh) !== null
    },
    { key: 'background', type: 'color', label: 'Background' },
    {
      key: 'sandbox',
      type: 'boolean',
      label: 'Sandbox the embedded page',
      hint: 'A page served by openHAB itself can otherwise read this dashboard and your session token. Sandboxing walls it off, but it can then no longer reach openHAB at all: Basic UI, Main UI and HABPanel still draw themselves and quietly stop updating. Pages on any other address are already isolated by the browser, so this does nothing for them.',
      showIf: (c) => !usesItem(c)
    }
  ],
  itemKeys: (c) => (usesItem(c) && typeof c.item === 'string' ? [c.item] : []),
  canCommand: () => false,
  controlFor: () => undefined,
  Component: FrameWidget
}
