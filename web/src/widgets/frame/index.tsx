import { useEffect, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'

interface FrameConfig {
  url: string
  label?: string
  /** Reload interval in seconds (0 = never). */
  refresh?: number
}

/** Frame - embeds an external page (weather, cameras, other UIs). */
function FrameWidget({ config }: WidgetProps<FrameConfig>) {
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!config.refresh || config.refresh <= 0) return
    const id = setInterval(() => setGeneration((n) => n + 1), config.refresh * 1000)
    return () => clearInterval(id)
  }, [config.refresh])

  if (!config.url) {
    return (
      <WidgetFrame label={config.label} center>
        <span className="nh-image__placeholder">No URL configured</span>
      </WidgetFrame>
    )
  }

  return (
    <WidgetFrame label={config.label} bare>
      <iframe key={generation} className="nh-frame" src={config.url} title={config.label ?? 'frame'} />
    </WidgetFrame>
  )
}

export const frameWidget: WidgetDefinition<FrameConfig> = {
  type: 'frame',
  name: 'Frame',
  description: 'Embed a web page',
  defaultSize: { w: 6, h: 5 },
  defaultConfig: () => ({ url: '', refresh: 0 }),
  settings: [
    { key: 'url', type: 'text', label: 'Page URL', placeholder: 'https://…' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'refresh', type: 'number', label: 'Reload (seconds)', min: 0 },
  ],
  Component: FrameWidget,
}
