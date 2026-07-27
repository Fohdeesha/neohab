import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetDefinition, WidgetProps } from '../types'
import { WidgetFrame } from '../common/WidgetFrame'
import { navigate } from '../../app/router'
import {
  TRANSPORT_OPTIONS,
  isConfigured,
  isMixedContent,
  isSameOrigin,
  normalizeServer,
  posterUrl,
  transportChain,
  transportUrl,
  type CameraConfig,
  type CameraTransport,
} from './model'
import type { PlayerHandle, PlayerStatus } from './player'

const TRANSPORT_LABEL: Record<CameraTransport, string> = {
  webrtc: 'WebRTC',
  mse: 'MSE',
  hls: 'HLS',
  mp4: 'MP4',
  mjpeg: 'MJPEG',
  snapshot: 'Snapshot',
  iframe: 'Embedded player',
}

/**
 * Live camera view.
 *
 * The transports themselves live in ./player, loaded on demand. This component owns everything
 * around them: when to be connected at all, what a tap does, and what to say when the picture
 * cannot be produced - which for cameras is at least as common as success, and is otherwise
 * indistinguishable from a black rectangle.
 */
function CameraWidget({ config, ctx }: WidgetProps<CameraConfig>) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<PlayerHandle | null>(null)
  const [status, setStatus] = useState<PlayerStatus>({ phase: 'connecting', transport: null, failed: [] })
  const [wanted, setWanted] = useState(config.offscreen === 'keep')

  const configured = isConfigured(config)
  const poster = posterUrl(config)
  const chain = transportChain(config)
  const firstUrl = chain.map((tr) => transportUrl(config, tr)).find((u): u is string => !!u) ?? ''
  const mixed = !!firstUrl && isMixedContent(firstUrl)

  // Anything that changes what we would connect to must restart the stream.
  const streamKey = JSON.stringify([
    config.source,
    normalizeServer(config.server),
    config.stream,
    config.url,
    config.transport,
    config.audio,
    config.fit,
    config.snapshotInterval,
    poster,
  ])

  /*
   * Only stream what someone can actually see. A dashboard left open on another tab, or a
   * camera scrolled off a long phone layout, otherwise keeps a decoder and a socket busy
   * indefinitely - which on a wall panel is the difference between working and saturating
   * the uplink. 'keep' opts out for the one case that wants it: instant switching.
   */
  useEffect(() => {
    if (config.offscreen === 'keep') {
      setWanted(true)
      return
    }
    const el = wrapRef.current
    if (!el) return
    let onScreen = false

    const evaluate = () => setWanted(onScreen && document.visibilityState !== 'hidden')

    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting)
        evaluate()
      },
      { threshold: 0.01 }
    )
    observer.observe(el)
    document.addEventListener('visibilitychange', evaluate)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', evaluate)
    }
  }, [config.offscreen])

  useEffect(() => {
    if (!configured || mixed || !wanted) return
    const host = hostRef.current
    if (!host) return

    let disposed = false
    setStatus({ phase: 'connecting', transport: null, failed: [] })

    void import('./player').then(({ startCamera }) => {
      if (disposed || !hostRef.current) return
      playerRef.current = startCamera({
        host: hostRef.current,
        chain,
        urlFor: (tr) => transportUrl(config, tr),
        audio: config.audio === true,
        fit: config.fit === 'cover' ? 'cover' : 'contain',
        poster,
        snapshotInterval: Number(config.snapshotInterval) || 5,
        onStatus: (s) => {
          if (!disposed) setStatus(s)
        },
      })
    })

    return () => {
      disposed = true
      playerRef.current?.stop()
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey, configured, mixed, wanted])

  const tap = () => {
    if (ctx.editing) return
    switch (config.tapAction) {
      case 'fullscreen':
        void enterFullscreen(wrapRef.current)
        break
      case 'dashboard':
        if (config.tapDashboard) navigate({ name: 'dashboard', id: config.tapDashboard })
        break
      case 'url':
        if (config.tapUrl) window.open(config.tapUrl, '_blank', 'noopener')
        break
      case 'command':
        if (config.tapItem && config.tapCommand) void ctx.sendCommand(config.tapItem, config.tapCommand)
        break
    }
  }

  // Nothing to open, navigate from, or make fullscreen until there is a picture to act on.
  const interactive = !ctx.editing && configured && !mixed && (config.tapAction ?? 'fullscreen') !== 'none'

  /*
   * WebRTC and MSE both ride a WebSocket the camera server can refuse cross-origin, while its
   * HLS and image endpoints stay open. When exactly that pattern shows up, the fix is one line
   * of server config, so say which line rather than reporting a generic failure.
   */
  const wsRefused =
    (config.source ?? 'go2rtc') !== 'url' &&
    !isSameOrigin(normalizeServer(config.server)) &&
    (status.failed.includes('webrtc') || status.failed.includes('mse'))

  let overlay: string | null = null
  if (!configured) overlay = t('No camera configured')
  else if (mixed) overlay = t('This page is served over HTTPS, so it cannot show a stream from an insecure http:// address.')
  else if (!wanted) overlay = null
  else if (status.phase === 'connecting') overlay = t('Connecting…')
  else if (status.phase === 'failed') overlay = t('No stream. Tried: {{list}}', { list: status.failed.map((f) => TRANSPORT_LABEL[f]).join(', ') || '—' })

  const labelMode = config.labelMode ?? 'header'
  const name = (config.label ?? '').trim()

  return (
    <WidgetFrame label={labelMode === 'header' ? config.label : undefined} bare>
      <div className="nh-camera" ref={wrapRef}>
        {/* Placement follows the cell's --nh-labelalign / .nh-labelbottom, the same pair the
            header row obeys, so the Name alignment and position settings drive both modes. */}
        {labelMode === 'overlay' && name ? (
          <div className={'nh-camera__name' + (config.overlayColor === 'black' ? ' nh-camera__name--dark' : '')}>
            {name}
          </div>
        ) : null}
        {/* The player appends its own <video>/<img>/<iframe> here and owns its teardown. */}
        <div className="nh-camera__host" ref={hostRef} />

        {/* A still keeps the cell from being a black hole while stopped or connecting. */}
        {poster && status.phase !== 'playing' && !mixed && configured ? (
          <img
            className="nh-camera__poster"
            src={poster}
            alt=""
            style={{ objectFit: config.fit === 'cover' ? 'cover' : 'contain' }}
          />
        ) : null}

        {overlay ? <div className="nh-camera__status">{overlay}</div> : null}

        {/* Configuration feedback belongs in the editor, not on a working wall panel. */}
        {ctx.editing && status.phase === 'playing' && status.transport ? (
          <div className="nh-camera__badge">{TRANSPORT_LABEL[status.transport]}</div>
        ) : null}
        {ctx.editing && wsRefused ? (
          <div className="nh-camera__hint">
            {t('Low-latency streaming was refused by the camera server. For go2rtc, add api: {origin: "*"} to go2rtc.yaml.')}
          </div>
        ) : null}

        {interactive ? (
          <button type="button" className="nh-camera__tap" onClick={tap} aria-label={config.label ?? t('Camera')} />
        ) : null}
      </div>
    </WidgetFrame>
  )
}

/**
 * Real fullscreen, not a fixed-position overlay: grid cells are size containers, which makes
 * them the containing block for fixed descendants, so an overlay could never escape its cell.
 * iOS has no element fullscreen at all, and only ever offers it on the video itself.
 */
async function enterFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el) return
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => {})
    return
  }
  if (el.requestFullscreen) {
    await el.requestFullscreen().catch(() => {})
    return
  }
  const video = el.querySelector('video') as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
  video?.webkitEnterFullscreen?.()
}

const isServerSource = (c: Record<string, unknown>) => (c.source ?? 'go2rtc') !== 'url'
const isUrlSource = (c: Record<string, unknown>) => (c.source ?? 'go2rtc') === 'url'

export const cameraWidget: WidgetDefinition<CameraConfig> = {
  type: 'camera',
  name: 'Camera',
  description: 'Live video from a camera stream',
  defaultSize: { w: 6, h: 5 },
  minPixelHeight: 140,
  hasHeader: true,
  defaultConfig: () => ({
    source: 'go2rtc',
    server: '',
    stream: '',
    transport: 'auto',
    audio: false,
    fit: 'contain',
    snapshotInterval: 5,
    tapAction: 'fullscreen',
    offscreen: 'stop',
    labelMode: 'header',
    overlayColor: 'white',
  }),
  settings: [
    { key: 'label', type: 'text', label: 'Name' },
    {
      key: 'labelMode',
      type: 'select',
      label: 'Show the name',
      options: [
        { value: 'header', label: 'In the title bar' },
        { value: 'overlay', label: 'Over the picture' },
        { value: 'none', label: 'Not at all' },
      ],
      hint: 'Over the picture puts the name on the video itself, so the whole cell stays picture. It sits wherever Name alignment and Name position put it.',
      showIf: (c) => !!String(c.label ?? '').trim(),
    },
    {
      key: 'overlayColor',
      type: 'select',
      label: 'Name colour over the picture',
      options: [
        { value: 'white', label: 'White' },
        { value: 'black', label: 'Black' },
      ],
      hint: 'Each is carried on a shadow of the opposite colour. White suits most scenes; black reads better against snow, pale ground or a bright sky.',
      showIf: (c) => c.labelMode === 'overlay' && !!String(c.label ?? '').trim(),
    },
    {
      key: 'source',
      type: 'select',
      label: 'Camera server',
      options: [
        { value: 'go2rtc', label: 'go2rtc' },
        { value: 'frigate', label: 'Frigate' },
        { value: 'url', label: 'Direct stream URL' },
      ],
      hint: 'go2rtc and Frigate build every stream URL from the server address and a camera name. Anything else - an openHAB ipcamera binding, a camera that serves its own MJPEG - uses a direct URL.',
    },
    {
      key: 'server',
      type: 'text',
      label: 'Server address',
      placeholder: 'http://192.168.1.10:1984',
      showIf: isServerSource,
    },
    { key: 'stream', type: 'camerastream', label: 'Camera', showIf: isServerSource },
    {
      key: 'url',
      type: 'text',
      label: 'Stream URL',
      placeholder: 'http://…/stream.m3u8',
      showIf: isUrlSource,
      hint: 'An MJPEG stream, an HLS playlist (.m3u8), an MP4 stream, a still image, or a WebRTC signalling address.',
    },
    {
      key: 'transport',
      type: 'select',
      label: 'Stream type',
      options: TRANSPORT_OPTIONS,
      hint: 'Automatic tries the lowest-latency option first and falls back until one works. Pick a specific one to stop it varying.',
    },
    {
      key: 'posterUrl',
      type: 'text',
      label: 'Still image URL (optional)',
      hint: 'Shown before the stream starts and while it is stopped. Derived from the camera server when left empty.',
    },
    { key: 'fit', type: 'select', label: 'Scaling', options: [
      { value: 'contain', label: 'Fit (show the whole picture)' },
      { value: 'cover', label: 'Fill (crop to the cell)' },
    ] },
    { key: 'audio', type: 'boolean', label: 'Play audio', hint: 'Browsers only allow sound after you interact with the page.' },
    {
      key: 'snapshotInterval',
      type: 'number',
      label: 'Snapshot interval (seconds)',
      min: 1,
      showIf: (c) => c.transport === 'snapshot',
    },
    {
      key: 'offscreen',
      type: 'select',
      label: 'When not visible',
      options: [
        { value: 'stop', label: 'Stop the stream' },
        { value: 'keep', label: 'Keep streaming' },
      ],
      hint: 'Stopping frees the connection when the widget is scrolled away, the dashboard is not open, or the tab is in the background.',
    },
    {
      key: 'tapAction',
      type: 'select',
      label: 'On tap',
      options: [
        { value: 'fullscreen', label: 'Enter fullscreen' },
        { value: 'dashboard', label: 'Go to dashboard' },
        { value: 'url', label: 'Open URL' },
        { value: 'command', label: 'Send command' },
        { value: 'none', label: 'None' },
      ],
    },
    { key: 'tapDashboard', type: 'dashboard', label: 'Go to dashboard', showIf: (c) => c.tapAction === 'dashboard' },
    { key: 'tapUrl', type: 'text', label: 'Open URL', showIf: (c) => c.tapAction === 'url' },
    { key: 'tapItem', type: 'item', label: 'openHAB Item', showIf: (c) => c.tapAction === 'command' },
    { key: 'tapCommand', type: 'text', label: 'Command', showIf: (c) => c.tapAction === 'command' },
  ],
  Component: CameraWidget,
}
