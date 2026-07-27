/**
 * Every way a camera stream can reach a browser, behind one interface.
 *
 * Loaded on demand (with hls.js behind a further dynamic import), so dashboards without cameras
 * pay nothing for this. The widget hands over a host element and an ordered list of transports;
 * this walks the list until one produces moving pixels, then keeps it alive.
 *
 * Each attempt owns everything it creates - element, socket, peer connection, object URL - and
 * its cleanup removes all of it. A half-torn-down attempt would leak exactly the resource this
 * whole design is trying to conserve: a socket against the browser's six-per-origin budget.
 */
import type { CameraTransport } from './model'

export interface PlayerStatus {
  phase: 'connecting' | 'playing' | 'failed'
  /** The transport currently playing, or being attempted. */
  transport: CameraTransport | null
  /** Transports that were tried and failed during this run, in order. */
  failed: CameraTransport[]
  error?: string
}

export interface StartOptions {
  host: HTMLElement
  /** Ordered transports to attempt. */
  chain: CameraTransport[]
  /** URL for a transport, or null when this configuration cannot produce one. */
  urlFor: (transport: CameraTransport) => string | null
  audio: boolean
  fit: 'contain' | 'cover'
  poster: string | null
  /** Seconds between polls for the snapshot transport. */
  snapshotInterval: number
  onStatus: (status: PlayerStatus) => void
}

export interface PlayerHandle {
  stop(): void
}

type Cleanup = () => void

/** How long one transport gets to produce a first frame before the chain moves on. */
const CONNECT_TIMEOUT_MS = 8000
/** A playing stream whose clock stops for this long is dead, whatever the socket claims. */
const STALL_TIMEOUT_MS = 15000
/** Backoff before re-walking the chain after a stream that had been playing dropped. */
const RETRY_DELAY_MS = 3000
/**
 * How long a stream must survive its first frame to count as having genuinely worked. Below
 * this, the transport is treated as broken rather than interrupted - see onDrop.
 */
const STABLE_PLAYBACK_MS = 5000

/** fMP4 codecs go2rtc can mux, in its own preference order. */
const MSE_CODECS = [
  'avc1.640029', // H.264 high 4.1
  'avc1.64002A', // H.264 high 4.2
  'avc1.640033', // H.264 high 5.1
  'hvc1.1.6.L153.B0', // H.265 main 5.1
  'mp4a.40.2', // AAC LC
  'mp4a.40.5', // AAC HE
  'flac',
  'opus',
]

export function startCamera(opts: StartOptions): PlayerHandle {
  let disposed = false
  let cleanup: Cleanup | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  /** Index in the chain of the transport currently playing, and when it started. */
  let playingIndex = -1
  let playingSince = 0
  const failed: CameraTransport[] = []

  const clear = () => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (cleanup) {
      try {
        cleanup()
      } catch {
        /* teardown must never throw into the caller */
      }
      cleanup = null
    }
  }

  /**
   * A stream that had started playing has dropped.
   *
   * How long it lasted decides what that means. A stream that ran for a while and then died is a
   * network event: re-walk the chain from the top, because the best transport may well be back.
   * One that died within seconds of its first frame was never really working - a transmuxer that
   * produces a frame and then fails to parse the rest looks exactly like this - so that transport
   * is demoted and the chain continues past it. Without the distinction the widget retries a
   * broken transport forever and never reaches the one that works.
   */
  const onDrop = () => {
    if (disposed) return
    const wasBriefly = Date.now() - playingSince < STABLE_PLAYBACK_MS
    const resumeAt = wasBriefly ? playingIndex + 1 : 0
    const dropped = opts.chain[playingIndex]
    clear()
    playingIndex = -1
    if (wasBriefly) {
      // it never really worked, so it belongs in the tried-and-failed list like any other
      if (dropped && !failed.includes(dropped)) failed.push(dropped)
    } else {
      failed.length = 0
    }
    opts.onStatus({ phase: 'connecting', transport: null, failed: [...failed] })
    retryTimer = setTimeout(
      () => {
        retryTimer = null
        void run(resumeAt)
      },
      wasBriefly ? 0 : RETRY_DELAY_MS
    )
  }

  async function run(from = 0) {
    for (let i = from; i < opts.chain.length; i++) {
      if (disposed) return
      const transport = opts.chain[i]
      const url = opts.urlFor(transport)
      if (!url) continue

      opts.onStatus({ phase: 'connecting', transport, failed: [...failed] })
      try {
        const done = await attempt(transport, url, opts, onDrop)
        if (disposed) {
          done()
          return
        }
        cleanup = done
        playingIndex = i
        playingSince = Date.now()
        opts.onStatus({ phase: 'playing', transport, failed: [...failed] })
        return
      } catch (err) {
        if (!failed.includes(transport)) failed.push(transport)
        if (disposed) return
        opts.onStatus({ phase: 'connecting', transport, failed: [...failed], error: message(err) })
      }
    }
    if (!disposed) {
      opts.onStatus({ phase: 'failed', transport: null, failed: [...failed] })
    }
  }

  void run()

  return {
    stop() {
      disposed = true
      clear()
    },
  }
}

function message(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Wrap a teardown so running it twice is harmless: on the failure path both the first-frame
 * watcher's cleanup and the attempt's own catch block reach it.
 */
function once(fn: Cleanup): Cleanup {
  let done = false
  return () => {
    if (done) return
    done = true
    fn()
  }
}

/** Attempt one transport. Resolves with its cleanup once playing; rejects on failure/timeout. */
function attempt(
  transport: CameraTransport,
  url: string,
  opts: StartOptions,
  onDrop: () => void
): Promise<Cleanup> {
  switch (transport) {
    case 'webrtc':
      return attemptWebRTC(url, opts, onDrop)
    case 'mse':
      return attemptMSE(url, opts, onDrop)
    case 'hls':
      return attemptHLS(url, opts, onDrop)
    case 'mp4':
      return attemptMediaSrc(url, opts, onDrop)
    case 'mjpeg':
      return attemptMJPEG(url, opts, onDrop)
    case 'snapshot':
      return attemptSnapshot(url, opts)
    case 'iframe':
      return attemptIframe(url, opts)
  }
}

/* ---------------------------------------------------------------- element helpers */

function makeVideo(opts: StartOptions): HTMLVideoElement {
  const video = document.createElement('video')
  video.className = 'nh-camera__media'
  video.style.objectFit = opts.fit
  video.autoplay = true
  video.controls = false
  // iOS refuses to play inline without this and takes the whole screen instead.
  video.playsInline = true
  video.muted = !opts.audio
  video.preload = 'none'
  if (opts.poster) video.poster = opts.poster
  return video
}

function makeImage(opts: StartOptions): HTMLImageElement {
  const img = document.createElement('img')
  img.className = 'nh-camera__media'
  img.style.objectFit = opts.fit
  img.decoding = 'async'
  img.alt = ''
  return img
}

/**
 * Start playback, surviving the autoplay policy: unmuted playback needs a user gesture, so a
 * camera asked to carry audio falls back to muted rather than showing a frozen first frame.
 */
async function play(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play()
  } catch (err) {
    if (!video.muted && (err as DOMException)?.name === 'NotAllowedError') {
      video.muted = true
      try {
        await video.play()
      } catch {
        /* still refused; the poster stays up and the stall watchdog decides */
      }
      return
    }
    /* other failures surface through the element's error/stall handling */
  }
}

/**
 * Resolve when the element first shows a *picture*, reject on error or after the connect budget.
 * Also arms the liveness watchdogs that outlive the connection phase.
 *
 * "A picture" deliberately means decoded video dimensions, not merely a loadeddata event. A
 * media element happily reports itself loaded and playing while carrying only the audio track -
 * which is exactly what happens when a transmuxer misidentifies a stream - and treating that as
 * success ends the transport chain on a black rectangle that never recovers.
 */
function firstFrame(
  media: HTMLVideoElement | HTMLImageElement,
  onDrop: () => void,
  extraCleanup: Cleanup
): Promise<Cleanup> {
  return new Promise<Cleanup>((resolve, reject) => {
    const isVideo = media instanceof HTMLVideoElement
    let settled = false
    let stallTimer: ReturnType<typeof setInterval> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const timeout = setTimeout(() => finish(new Error('no video')), CONNECT_TIMEOUT_MS)

    /**
     * Every step is individually guarded. Teardown runs on the failure path, and a throw here
     * used to mean the attempt's promise never settled at all - the chain would stop dead on
     * "connecting" rather than moving to the next transport.
     */
    const cleanup: Cleanup = () => {
      clearTimeout(timeout)
      if (stallTimer) clearInterval(stallTimer)
      if (pollTimer) clearInterval(pollTimer)
      const step = (fn: () => void) => {
        try {
          fn()
        } catch {
          /* teardown is best-effort by definition */
        }
      }
      step(() => media.removeEventListener('error', onError))
      step(() => media.removeEventListener(readyEvent, check))
      if (isVideo) {
        step(() => media.removeEventListener('resize', check))
        step(() => media.removeEventListener('ended', onLost))
        // Detaching the source is what actually releases the socket/decoder.
        step(() => media.pause())
        step(() => (media.srcObject = null))
        step(() => media.removeAttribute('src'))
        step(() => media.load())
      } else {
        step(() => media.removeAttribute('src'))
      }
      step(() => media.remove())
      step(extraCleanup)
    }

    function finish(err?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
      if (err) {
        try {
          cleanup()
        } finally {
          reject(err)
        }
      } else {
        armWatchdog()
        resolve(cleanup)
      }
    }

    const onError = () => (settled ? onLost() : finish(new Error('stream error')))
    const onLost = () => {
      if (!settled) return
      onDrop()
    }

    /** Has this element actually produced an image yet? */
    const check = () => {
      if (settled) return
      if (isVideo ? media.videoWidth > 0 : media.naturalWidth > 0) finish()
    }

    // A video's dimensions arrive with loadeddata, or later via resize when a track shows up
    // after the fact; an <img> streaming multipart fires load on its first part.
    const readyEvent = isVideo ? 'loadeddata' : 'load'
    media.addEventListener(readyEvent, check)
    media.addEventListener('error', onError)
    if (isVideo) {
      media.addEventListener('resize', check)
      media.addEventListener('ended', onLost)
      // Belt and braces: dimensions can appear without either event firing again.
      pollTimer = setInterval(check, 250)
    }

    /** A socket can stay open while the pictures stop; only the clock proves otherwise. */
    function armWatchdog() {
      if (!(media instanceof HTMLVideoElement)) return
      let lastTime = -1
      let lastMoved = Date.now()
      stallTimer = setInterval(() => {
        if (media.paused) return
        if (media.currentTime !== lastTime) {
          lastTime = media.currentTime
          lastMoved = Date.now()
          return
        }
        if (Date.now() - lastMoved > STALL_TIMEOUT_MS) onLost()
      }, 2000)
    }
  })
}

/* ---------------------------------------------------------------- go2rtc WebSocket */

/** Open a WebSocket, or reject. A cross-origin refusal (HTTP 403) arrives here as a close. */
function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (err) {
      reject(new Error(message(err)))
      return
    }
    ws.binaryType = 'arraybuffer'
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('timed out'))
    }, CONNECT_TIMEOUT_MS)
    const fail = () => {
      clearTimeout(timer)
      // The browser hides the handshake status from script, so this covers both "refused"
      // and "unreachable". The widget distinguishes them by whether a later transport worked.
      reject(new Error('connection refused'))
    }
    ws.addEventListener('open', () => {
      clearTimeout(timer)
      ws.removeEventListener('close', fail)
      ws.removeEventListener('error', fail)
      resolve(ws)
    })
    ws.addEventListener('close', fail)
    ws.addEventListener('error', fail)
  })
}

async function attemptWebRTC(url: string, opts: StartOptions, onDrop: () => void): Promise<Cleanup> {
  if (!('RTCPeerConnection' in window)) throw new Error('WebRTC unsupported')
  const ws = await openSocket(url)

  const pc = new RTCPeerConnection({
    iceServers: [],
    // Camera servers answer with host candidates on the LAN; gathering the full set only
    // delays the first frame.
    bundlePolicy: 'max-bundle',
  })
  const video = makeVideo(opts)
  opts.host.appendChild(video)

  const teardown = once(() => {
    try {
      pc.close()
    } catch {
      /* already closed */
    }
    try {
      ws.close()
    } catch {
      /* already closed */
    }
  })

  try {
    const ready = firstFrame(video, onDrop, teardown)

    pc.addEventListener('icecandidate', (ev) => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(
        JSON.stringify({
          type: 'webrtc/candidate',
          value: ev.candidate ? ev.candidate.toJSON().candidate : '',
        })
      )
    })

    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') {
        const tracks = pc
          .getTransceivers()
          .filter((tr) => tr.currentDirection === 'recvonly')
          .map((tr) => tr.receiver.track)
        if (tracks.length > 0) {
          video.srcObject = new MediaStream(tracks)
          void play(video)
        }
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        video.dispatchEvent(new Event('error'))
      }
    })

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return
      let msg: { type?: string; value?: string }
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type === 'webrtc/candidate' && msg.value) {
        pc.addIceCandidate({ candidate: msg.value, sdpMid: '0' }).catch(() => {})
      } else if (msg.type === 'webrtc/answer' && msg.value) {
        pc.setRemoteDescription({ type: 'answer', sdp: msg.value }).catch(() => {})
      } else if (msg.type === 'error' && (msg.value ?? '').includes('webrtc/offer')) {
        video.dispatchEvent(new Event('error'))
      }
    })
    ws.addEventListener('close', () => video.dispatchEvent(new Event('error')))

    pc.addTransceiver('video', { direction: 'recvonly' })
    if (opts.audio) pc.addTransceiver('audio', { direction: 'recvonly' })

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }))

    return await ready
  } catch (err) {
    video.remove()
    teardown()
    throw err
  }
}

async function attemptMSE(url: string, opts: StartOptions, onDrop: () => void): Promise<Cleanup> {
  const MS: typeof MediaSource | undefined =
    (window as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource ??
    (typeof MediaSource !== 'undefined' ? MediaSource : undefined)
  if (!MS) throw new Error('MSE unsupported')

  const ws = await openSocket(url)
  const video = makeVideo(opts)
  const ms = new MS()
  let objectUrl: string | null = null
  opts.host.appendChild(video)

  const teardown = once(() => {
    try {
      ws.close()
    } catch {
      /* already closed */
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  })

  try {
    const ready = firstFrame(video, onDrop, teardown)

    if ('ManagedMediaSource' in window) {
      video.disableRemotePlayback = true
      video.srcObject = ms as unknown as MediaProvider
    } else {
      objectUrl = URL.createObjectURL(ms)
      video.src = objectUrl
    }

    ms.addEventListener(
      'sourceopen',
      () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
        }
        // 'avc1'/'hvc1' are the video codecs; the rest are audio, and are only worth asking
        // for when this camera is actually carrying sound.
        const supported = MSE_CODECS.filter((c) => {
          const isVideo = c.includes('vc1')
          if (!isVideo && !opts.audio) return false
          return MS.isTypeSupported(`video/mp4; codecs="${c}"`)
        }).join()
        ws.send(JSON.stringify({ type: 'mse', value: supported }))
      },
      { once: true }
    )

    const queue: ArrayBuffer[] = []
    let sb: SourceBuffer | null = null

    const drain = () => {
      if (!sb || sb.updating || queue.length === 0) return
      const chunk = queue.shift()!
      try {
        sb.appendBuffer(chunk)
      } catch {
        /* buffer full or closed; the stall watchdog will take it from here */
      }
    }

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') {
        let msg: { type?: string; value?: string }
        try {
          msg = JSON.parse(ev.data)
        } catch {
          return
        }
        if (msg.type !== 'mse' || !msg.value || sb) return
        try {
          sb = ms.addSourceBuffer(msg.value)
          sb.mode = 'segments'
          sb.addEventListener('updateend', () => {
            drain()
            trimAndCatchUp(video, sb!)
          })
        } catch {
          video.dispatchEvent(new Event('error'))
        }
        void play(video)
        return
      }
      queue.push(ev.data as ArrayBuffer)
      // An unbounded queue is how a slow decoder turns into a memory leak.
      if (queue.length > 60) queue.splice(0, queue.length - 30)
      drain()
    })
    ws.addEventListener('close', () => video.dispatchEvent(new Event('error')))

    return await ready
  } catch (err) {
    video.remove()
    teardown()
    throw err
  }
}

/**
 * Keep an MSE stream near the live edge and its buffer bounded. Left alone, a buffered stream
 * drifts further behind real time the longer a wall panel runs.
 */
function trimAndCatchUp(video: HTMLVideoElement, sb: SourceBuffer): void {
  if (sb.updating || !sb.buffered.length) return
  const end = sb.buffered.end(sb.buffered.length - 1)
  const start = sb.buffered.start(0)
  if (end - start > 15) {
    try {
      sb.remove(start, end - 10)
      return
    } catch {
      /* removal races an append; next updateend retries */
    }
  }
  if (video.currentTime < end - 5 || video.currentTime < start) video.currentTime = end - 0.5
}

/* ---------------------------------------------------------------- plain media elements */

async function attemptHLS(url: string, opts: StartOptions, onDrop: () => void): Promise<Cleanup> {
  const video = makeVideo(opts)
  opts.host.appendChild(video)

  // Safari plays HLS natively, and its own pipeline beats anything running in JS.
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    const ready = firstFrame(video, onDrop, () => {})
    video.src = url
    void play(video)
    return ready
  }

  const { default: Hls } = await import('hls.js')
  if (!Hls.isSupported()) {
    video.remove()
    throw new Error('HLS unsupported')
  }
  const hls = new Hls({
    lowLatencyMode: true,
    liveSyncDurationCount: 2,
    backBufferLength: 10,
    manifestLoadingTimeOut: CONNECT_TIMEOUT_MS,
  })
  const teardown = once(() => hls.destroy())
  try {
    const ready = firstFrame(video, onDrop, teardown)
    hls.on(Hls.Events.ERROR, (_e, data) => {
      // Only fatal errors end the attempt; hls.js recovers from the rest by itself.
      if (data.fatal) video.dispatchEvent(new Event('error'))
    })
    hls.loadSource(url)
    hls.attachMedia(video)
    void play(video)
    return await ready
  } catch (err) {
    video.remove()
    teardown()
    throw err
  }
}

async function attemptMediaSrc(url: string, opts: StartOptions, onDrop: () => void): Promise<Cleanup> {
  const video = makeVideo(opts)
  opts.host.appendChild(video)
  const ready = firstFrame(video, onDrop, () => {})
  video.src = url
  void play(video)
  return ready
}

async function attemptMJPEG(url: string, opts: StartOptions, onDrop: () => void): Promise<Cleanup> {
  const img = makeImage(opts)
  opts.host.appendChild(img)
  const ready = firstFrame(img, onDrop, () => {})
  img.src = url
  return ready
}

/**
 * Poll a still image. The one path that needs nothing from the server but a JPEG, so it is the
 * last resort - and the only one that holds no connection between frames.
 */
async function attemptSnapshot(url: string, opts: StartOptions): Promise<Cleanup> {
  const img = makeImage(opts)
  opts.host.appendChild(img)
  const period = Math.max(1, opts.snapshotInterval || 5) * 1000
  let timer: ReturnType<typeof setInterval> | null = null

  const bust = () => url + (url.includes('?') ? '&' : '?') + '_=' + Date.now()

  const ready = firstFrame(img, () => {}, () => {
    if (timer) clearInterval(timer)
  })
  img.src = bust()
  const done = await ready

  // Fetch and decode the next frame off-screen, then swap it in. Assigning straight to the
  // visible element would blank it for the whole round trip, which at a short interval is most
  // of the time the widget is on screen.
  timer = setInterval(() => {
    const next = new Image()
    const url = bust()
    next.src = url
    next
      .decode()
      .then(() => {
        img.src = url // already in the memory cache, so this swap is immediate
      })
      .catch(() => {
        /* a dropped frame is not worth reporting; the next tick tries again */
      })
  }, period)
  return done
}

async function attemptIframe(url: string, opts: StartOptions): Promise<Cleanup> {
  const frame = document.createElement('iframe')
  frame.className = 'nh-camera__media nh-camera__frame'
  frame.setAttribute('frameborder', '0')
  frame.allow = 'autoplay; fullscreen; picture-in-picture'
  opts.host.appendChild(frame)

  return new Promise<Cleanup>((resolve, reject) => {
    const cleanup: Cleanup = () => {
      clearTimeout(timer)
      // Blanking the src first stops the embedded player's own sockets before the element goes.
      frame.src = 'about:blank'
      frame.remove()
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('timed out'))
    }, CONNECT_TIMEOUT_MS)
    frame.addEventListener(
      'load',
      () => {
        clearTimeout(timer)
        resolve(cleanup)
      },
      { once: true }
    )
    frame.src = url
  })
}
