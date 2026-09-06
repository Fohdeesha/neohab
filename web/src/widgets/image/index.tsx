import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { mixedContent, safeUrl } from '../../model/url'

interface ImageConfig {
  url: string
  label?: string
  /** Refresh interval in seconds (0 = never). Useful for camera snapshots. */
  refresh?: number
}

function ImageWidget({ config }: WidgetProps<ImageConfig>) {
  const { t } = useTranslation()
  // A timestamp rather than a counter: a counter restarts at 0 on every mount, so returning to
  // a dashboard re-requests a URL the browser already has cached and shows the stale frame.
  const [cacheBust, setCacheBust] = useState(0)

  useEffect(() => {
    if (!config.refresh || config.refresh <= 0) return
    const id = setInterval(() => setCacheBust(Date.now()), config.refresh * 1000)
    return () => clearInterval(id)
  }, [config.refresh])

  // Same allow-list the frame and the template engine use, so one stored URL cannot be a picture
  // here and something else there.
  const url = safeUrl(config.url)
  if (!url) {
    return (
      <WidgetFrame label={config.label} center>
        <span className="nh-image__placeholder">{config.url ? t('That image address cannot be shown.') : t('No image URL')}</span>
      </WidgetFrame>
    )
  }

  // Chromium upgrades a mixed-content image to https and blocks it when the upgrade fails, so
  // an http:// picture on an https page is a broken image with no explanation anywhere.
  if (mixedContent(url)) {
    return (
      <WidgetFrame label={config.label} center>
        <span className="nh-image__placeholder">
          {t('This page is served over HTTPS, so it cannot load an image from an insecure http:// address.')}
        </span>
      </WidgetFrame>
    )
  }

  const src = cacheBust > 0 ? appendParam(url, '_', String(cacheBust)) : url

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
    { key: 'url', type: 'text', label: 'Image URL', placeholder: 'https://…', subresource: true },
    { key: 'label', type: 'text', label: 'Name' },
    { key: 'refresh', type: 'number', label: 'Refresh (seconds)', min: 0 }
  ],
  Component: ImageWidget
}
