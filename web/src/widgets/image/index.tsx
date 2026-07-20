import { useEffect, useState } from 'react'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'

interface ImageConfig {
  url: string
  label?: string
  /** Refresh interval in seconds (0 = never). Useful for camera snapshots. */
  refresh?: number
}

function ImageWidget({ config }: WidgetProps<ImageConfig>) {
  const [cacheBust, setCacheBust] = useState(0)

  useEffect(() => {
    if (!config.refresh || config.refresh <= 0) return
    const id = setInterval(() => setCacheBust((n) => n + 1), config.refresh * 1000)
    return () => clearInterval(id)
  }, [config.refresh])

  if (!config.url) {
    return (
      <WidgetFrame label={config.label} center>
        <span className="nh-image__placeholder">No image URL</span>
      </WidgetFrame>
    )
  }

  const src = cacheBust > 0 ? appendParam(config.url, '_', String(cacheBust)) : config.url

  return (
    <WidgetFrame label={config.label} bare>
      <img className="nh-image" src={src} alt={config.label ?? 'image'} />
    </WidgetFrame>
  )
}

function appendParam(url: string, key: string, value: string): string {
  return url + (url.includes('?') ? '&' : '?') + key + '=' + encodeURIComponent(value)
}

export const imageWidget: WidgetDefinition<ImageConfig> = {
  type: 'image',
  name: 'Image',
  description: 'Show an image or camera snapshot',
  defaultSize: { w: 6, h: 4 },
  hasHeader: true,
  defaultConfig: () => ({ url: '', refresh: 0 }),
  settings: [
    { key: 'url', type: 'text', label: 'Image URL', placeholder: 'https://…' },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'refresh', type: 'number', label: 'Refresh (seconds)', min: 0 },
  ],
  Component: ImageWidget,
}
