import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { isSameOrigin } from '../../model/url'

interface FrameConfig {
  url: string
  label?: string
  /** Reload interval in seconds (0 = never). */
  refresh?: number
  /** Sandbox a page served from this openHAB (default false). Ignored for other origins. */
  sandbox?: boolean
}

/** Frame - embeds an external page (weather, cameras, other UIs). */
function FrameWidget({ config }: WidgetProps<FrameConfig>) {
  const { t } = useTranslation()
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!config.refresh || config.refresh <= 0) return
    const id = setInterval(() => setGeneration((n) => n + 1), config.refresh * 1000)
    return () => clearInterval(id)
  }, [config.refresh])

  if (!config.url) {
    return (
      <WidgetFrame label={config.label} center>
        <span className="nh-image__placeholder">{t('No URL configured')}</span>
      </WidgetFrame>
    )
  }

  // Only same-origin pages are worth sandboxing: the browser already walls off other origins
  // from the app's DOM, storage and token, and sandboxing them breaks pages that legitimately
  // need their own origin (WebRTC camera streams). A URL we cannot place counts as ours, so it
  // is at least sandboxable rather than silently exempt.
  const sandboxed = config.sandbox === true && isSameOrigin(config.url, true)

  return (
    <WidgetFrame label={config.label} bare>
      {/* the sandbox attribute only takes effect on load, so toggling it remounts the frame */}
      <iframe
        key={`${generation}:${sandboxed}`}
        className="nh-frame"
        src={config.url}
        title={config.label ?? 'frame'}
        sandbox={sandboxed ? 'allow-scripts' : undefined}
      />
    </WidgetFrame>
  )
}

export const frameWidget: WidgetDefinition<FrameConfig> = {
  type: 'frame',
  name: 'Frame',
  description: 'Embed a web page',
  defaultSize: { w: 6, h: 5 },
  hasHeader: true,
  defaultConfig: () => ({ url: '', refresh: 0, sandbox: false }),
  settings: [
    { key: 'url', type: 'text', label: 'Page URL', placeholder: 'https://…' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'refresh', type: 'number', label: 'Reload (seconds)', min: 0 },
    {
      key: 'sandbox',
      type: 'boolean',
      label: 'Sandbox the embedded page',
      hint: 'A page served by openHAB itself can otherwise read this dashboard and your session token. Sandboxing walls it off, but it can then no longer reach openHAB at all: Basic UI, Main UI and HABPanel still draw themselves and quietly stop updating. Pages on any other address are already isolated by the browser, so this does nothing for them.',
    },
  ],
  Component: FrameWidget,
}
