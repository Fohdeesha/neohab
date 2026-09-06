import { isSameOrigin } from '../../model/url'

export type CameraTransport = 'webrtc' | 'mse' | 'hls' | 'mp4' | 'mjpeg' | 'snapshot' | 'iframe'

export type CameraSourceKind = 'go2rtc' | 'frigate' | 'url'

export interface CameraConfig {
  label?: string
  labelMode?: 'header' | 'overlay' | 'none'
  overlayColor?: 'white' | 'black'
  source?: CameraSourceKind
  server?: string
  stream?: string
  url?: string
  posterUrl?: string
  transport?: 'auto' | CameraTransport
  audio?: boolean
  fit?: 'contain' | 'cover'
  snapshotInterval?: number
  tapAction?: 'none' | 'fullscreen' | 'dashboard' | 'url' | 'command'
  tapDashboard?: string
  tapUrl?: string
  tapItem?: string
  tapCommand?: string
  offscreen?: 'stop' | 'keep'
}

const SERVER_CHAIN: CameraTransport[] = ['webrtc', 'mse', 'iframe', 'hls', 'mjpeg', 'snapshot']

const URL_CHAIN: CameraTransport[] = ['hls', 'mjpeg', 'snapshot']

const IFRAME_MODES = 'webrtc,mse,mjpeg'

export const TRANSPORT_OPTIONS: { value: 'auto' | CameraTransport; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'webrtc', label: 'WebRTC (lowest latency)' },
  { value: 'mse', label: 'MSE / fMP4' },
  { value: 'hls', label: 'HLS' },
  { value: 'mp4', label: 'MP4 stream' },
  { value: 'mjpeg', label: 'MJPEG' },
  { value: 'snapshot', label: 'Snapshots only' },
  { value: 'iframe', label: "The server's own player" }
]

export function normalizeServer(server: string | undefined): string {
  const raw = (server ?? '').trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : 'http://' + raw
  return withScheme.replace(/\/+$/, '')
}

export function toWebSocketUrl(url: string): string {
  return url.replace(/^http/i, (m) => (m === 'HTTP' ? 'WS' : 'ws'))
}

export function isOwnOrigin(url: string): boolean {
  return isSameOrigin(url, false)
}

export function guessTransport(url: string): CameraTransport | null {
  const u = url.toLowerCase().split('?')[0]
  if (/^wss?:\/\//.test(url)) return 'webrtc'
  if (u.endsWith('.m3u8')) return 'hls'
  if (u.endsWith('.mp4')) return 'mp4'
  if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'snapshot'
  if (/mjpe?g/.test(u)) return 'mjpeg'
  if (/whep/.test(u)) return 'webrtc'
  if (u.endsWith('.html') || u.endsWith('.htm')) return 'iframe'
  return null
}

export function transportChain(config: CameraConfig): CameraTransport[] {
  const pinned = config.transport && config.transport !== 'auto' ? config.transport : null
  if (pinned) return [pinned]

  if ((config.source ?? 'go2rtc') === 'url') {
    const guess = config.url ? guessTransport(config.url) : null
    if (guess) return [guess, ...URL_CHAIN.filter((t) => t !== guess)]
    return [...URL_CHAIN]
  }
  return [...SERVER_CHAIN]
}

export function transportUrl(config: CameraConfig, transport: CameraTransport): string | null {
  const source = config.source ?? 'go2rtc'

  if (source === 'url') {
    const url = (config.url ?? '').trim()
    if (!url) return null
    if (transport === 'snapshot') return (config.posterUrl ?? '').trim() || url
    return url
  }

  const base = normalizeServer(config.server)
  const stream = (config.stream ?? '').trim()
  if (!base || !stream) return null
  const src = encodeURIComponent(stream)

  if (source === 'frigate') {
    switch (transport) {
      case 'webrtc':
        return toWebSocketUrl(base) + '/live/webrtc/api/ws?src=' + src
      case 'mse':
        return toWebSocketUrl(base) + '/live/mse/api/ws?src=' + src
      case 'hls':
        return base + '/live/hls/api/stream.m3u8?src=' + src
      case 'mp4':
        return base + '/live/mse/api/stream.mp4?src=' + src
      case 'mjpeg':
        return base + '/api/' + src
      case 'snapshot':
        return base + '/api/' + src + '/latest.jpg'
      case 'iframe':
        return base + '/live/webrtc/stream.html?src=' + src + '&mode=' + IFRAME_MODES
    }
  }

  switch (transport) {
    case 'webrtc':
    case 'mse':
      return toWebSocketUrl(base) + '/api/ws?src=' + src
    case 'hls':
      return base + '/api/stream.m3u8?src=' + src
    case 'mp4':
      return base + '/api/stream.mp4?src=' + src
    case 'mjpeg':
      return base + '/api/stream.mjpeg?src=' + src
    case 'snapshot':
      return base + '/api/frame.jpeg?src=' + src
    case 'iframe':
      return base + '/stream.html?src=' + src + '&mode=' + IFRAME_MODES
  }
}

export function posterUrl(config: CameraConfig): string | null {
  const explicit = (config.posterUrl ?? '').trim()
  if (explicit) return explicit
  return transportUrl(config, 'snapshot')
}

export function isConfigured(config: CameraConfig): boolean {
  if ((config.source ?? 'go2rtc') === 'url') return !!(config.url ?? '').trim()
  return !!normalizeServer(config.server) && !!(config.stream ?? '').trim()
}
