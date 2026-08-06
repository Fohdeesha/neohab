/**
 * Camera widget model: how a camera is configured, and where each transport's URL comes from.
 *
 * Pure data - no DOM, no network - so the widget, the settings form and the tests all agree on
 * one definition of what a camera is.
 *
 * Background, because it drives the whole design: a browser cannot play RTSP. Every H.264 path
 * below exists because some server repackages RTSP into something a `<video>` can accept, and
 * which of them are reachable depends on where that server is relative to this page:
 *
 *   - Same origin as neohab: everything works.
 *   - Another origin (the normal case - a camera server on its own host): only the transports
 *     the server marks CORS-open, plus the ones the browser never CORS-checks at all
 *     (`<img>`, `<video src>`). go2rtc marks its HLS endpoints `Access-Control-Allow-Origin: *`
 *     but rejects cross-origin WebSocket upgrades with 403 unless its own `api.origin` is set,
 *     so WebRTC and MSE need one line of server config while HLS, MJPEG and snapshots do not.
 *
 * That is also why embedding the server's own player page still works when nothing else does:
 * inside that frame the page *is* the server's origin, so its WebSocket is same-origin.
 */

/** How the pixels actually reach the browser. */
import { isSameOrigin } from '../../model/url'

export type CameraTransport = 'webrtc' | 'mse' | 'hls' | 'mp4' | 'mjpeg' | 'snapshot' | 'iframe'

/** Where the stream's URLs are derived from. */
export type CameraSourceKind = 'go2rtc' | 'frigate' | 'url'

export interface CameraConfig {
  label?: string
  /**
   * Where the name goes. 'header' is the shared title bar every other widget uses; 'overlay'
   * writes it over the picture instead, so the video keeps the whole cell; 'none' keeps the name
   * for the editor and the tap target's accessible label without drawing it.
   *
   * Overlay placement is not a separate setting: it follows the same per-widget Name alignment
   * and Name position the header obeys, so all six positions come from the fields already there.
   */
  labelMode?: 'header' | 'overlay' | 'none'
  /**
   * Ink for the overlaid name. White carried on a dark shadow is the broadcast convention and
   * survives most scenes; black on a light shadow is legible where white is not - a camera
   * pointed at snow, pale gravel or a blown-out sky.
   */
  overlayColor?: 'white' | 'black'
  /** Which URL scheme to build from. Default 'go2rtc'. */
  source?: CameraSourceKind
  /** Base URL of the camera server, e.g. `http://192.168.1.17:1984`. */
  server?: string
  /** Stream/camera name at that server. */
  stream?: string
  /** Direct URL, when `source` is 'url'. */
  url?: string
  /** Still image shown before the stream starts, and while it is stopped. */
  posterUrl?: string
  /** 'auto' walks {@link transportChain}; anything else pins one transport. */
  transport?: 'auto' | CameraTransport
  /** Play the stream's audio. Off by default: a wall of cameras must not all talk at once. */
  audio?: boolean
  /** 'contain' shows the whole frame letterboxed; 'cover' fills the cell and crops. */
  fit?: 'contain' | 'cover'
  /** Poll interval in seconds for the snapshot transport. */
  snapshotInterval?: number
  /** What tapping the widget does. */
  tapAction?: 'none' | 'fullscreen' | 'dashboard' | 'url' | 'command'
  tapDashboard?: string
  tapUrl?: string
  tapItem?: string
  tapCommand?: string
  /**
   * Whether to keep streaming when the widget can't be seen - scrolled out of view, another
   * dashboard, another tab, or behind the screensaver. 'stop' is the default: four cameras
   * left running on a hidden tab is the difference between a wall panel that works and one
   * that saturates its uplink.
   */
  offscreen?: 'stop' | 'keep'
}

/**
 * The "auto" order for a camera server, best first. Explicit picks skip this entirely.
 *
 * The embedded player sits third for a measured reason: when a server refuses cross-origin
 * WebSockets, its own player page still works perfectly, because inside that frame the page is
 * the server's origin. It therefore delivers WebRTC-grade video where the two transports above
 * it cannot connect at all, which beats dropping all the way to HLS or MJPEG. Its one weakness
 * is that a cross-origin frame cannot be inspected, so we can only see that it loaded - which is
 * why the transports that can be verified are tried first.
 */
const SERVER_CHAIN: CameraTransport[] = ['webrtc', 'mse', 'iframe', 'hls', 'mjpeg', 'snapshot']

/** The "auto" order for a bare URL: no signalling endpoint or player page can be derived. */
const URL_CHAIN: CameraTransport[] = ['hls', 'mjpeg', 'snapshot']

/**
 * Modes handed to an embedded go2rtc player. We cannot see inside a cross-origin frame to know
 * whether it succeeded, so it is given its own full fallback set rather than being pinned to
 * WebRTC and left showing nothing if that particular path fails.
 */
const IFRAME_MODES = 'webrtc,mse,mjpeg'

/** Transports offered in the settings dropdown, in the order a human would rank them. */
export const TRANSPORT_OPTIONS: { value: 'auto' | CameraTransport; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'webrtc', label: 'WebRTC (lowest latency)' },
  { value: 'mse', label: 'MSE / fMP4' },
  { value: 'hls', label: 'HLS' },
  { value: 'mp4', label: 'MP4 stream' },
  { value: 'mjpeg', label: 'MJPEG' },
  { value: 'snapshot', label: 'Snapshots only' },
  { value: 'iframe', label: "The server's own player" },
]

/** Normalise a user-typed server address into a base URL with no trailing slash. */
export function normalizeServer(server: string | undefined): string {
  const raw = (server ?? '').trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : 'http://' + raw
  return withScheme.replace(/\/+$/, '')
}

/** http(s) base -> ws(s) URL. WebSockets follow the page's scheme rules, so keep them in step. */
export function toWebSocketUrl(url: string): string {
  return url.replace(/^http/i, (m) => (m === 'HTTP' ? 'WS' : 'ws'))
}

/**
 * Is the camera server the origin serving neohab? Cross-origin cameras are the norm, but a
 * same-origin one (openHAB's own ipcamera binding, or a reverse proxy putting both behind one
 * host) is exempt from every CORS limitation above, so the widget can stop warning about it. An
 * address we cannot parse is NOT assumed to be ours: the warning it would suppress is the one
 * thing that explains the failure.
 */
export function isOwnOrigin(url: string): boolean {
  return isSameOrigin(url, false)
}

/**
 * True when this page is HTTPS but the camera is plain HTTP. The browser blocks that outright -
 * video, images, WebSocket and WebRTC signalling alike - and does it silently enough that the
 * widget has to say so itself, or it just looks broken.
 */
export function isMixedContent(url: string): boolean {
  if (location.protocol !== 'https:') return false
  try {
    return new URL(url, location.href).protocol === 'http:'
  } catch {
    return false
  }
}

/** Guess a transport from a bare URL, so "auto" on a hand-typed URL starts in the right place. */
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

/**
 * The ordered list of transports to attempt.
 *
 * A pinned transport is honoured exactly - "auto" is a convenience, not something that should
 * quietly override a deliberate choice, because "why is this camera suddenly laggy" is
 * unanswerable when the app is free to pick a different path each time.
 */
export function transportChain(config: CameraConfig): CameraTransport[] {
  const pinned = config.transport && config.transport !== 'auto' ? config.transport : null
  if (pinned) return [pinned]

  if ((config.source ?? 'go2rtc') === 'url') {
    // A guessed transport goes first, then the ones that could still work with the same URL.
    const guess = config.url ? guessTransport(config.url) : null
    if (guess) return [guess, ...URL_CHAIN.filter((t) => t !== guess)]
    return [...URL_CHAIN]
  }
  return [...SERVER_CHAIN]
}

/**
 * The URL for one transport, or null when this configuration cannot produce one.
 *
 * go2rtc's endpoints are verified against a live 1.9.14 server. Frigate's are its documented
 * paths: it embeds go2rtc and proxies it under /live, but its own port 1984 is usually bound to
 * localhost, so the proxy paths are the ones users can reach. Anyone whose install differs uses
 * the plain URL source instead.
 */
export function transportUrl(config: CameraConfig, transport: CameraTransport): string | null {
  const source = config.source ?? 'go2rtc'

  if (source === 'url') {
    const url = (config.url ?? '').trim()
    if (!url) return null
    // A snapshot poll can be served by any still-image URL, including an explicit poster.
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
      // One WebSocket carries both: the client asks for the mode it wants after connecting.
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

/** The still image to show before/instead of a live stream, if one can be derived. */
export function posterUrl(config: CameraConfig): string | null {
  const explicit = (config.posterUrl ?? '').trim()
  if (explicit) return explicit
  return transportUrl(config, 'snapshot')
}

/** True once this config names enough to attempt anything. */
export function isConfigured(config: CameraConfig): boolean {
  if ((config.source ?? 'go2rtc') === 'url') return !!(config.url ?? '').trim()
  return !!normalizeServer(config.server) && !!(config.stream ?? '').trim()
}
