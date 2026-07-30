/**
 * Playback for web-audio sink events: one shared <audio> element playing served streams.
 *
 * The stream is fetched explicitly (rather than assigned as the element's src) so the access
 * token rides along on servers that require one - an <audio> element cannot send auth headers.
 * An empty URL is the server's "stop playing" signal (the sink was asked to play nothing).
 */
import { applyAuthHeader, applyProxyAuth, getAccessToken } from '../api/auth'
import { setAudioBlocked } from '../store/audio'

let element: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
let lastUrl = ''

function el(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.addEventListener('ended', releaseUrl)
  }
  return element
}

function releaseUrl(): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

export function stopAudio(): void {
  lastUrl = ''
  if (!element) return
  element.pause()
  element.removeAttribute('src')
  releaseUrl()
}

/** Handle one playurl event: play the served stream, or stop on the empty-URL signal. */
export async function playAudioUrl(url: string): Promise<void> {
  if (!url) {
    stopAudio()
    return
  }
  // The same served-stream URL delivered twice (SSE reconnect replay) must not replay the
  // sound; every real play is served under a fresh unique URL.
  if (url === lastUrl) return
  lastUrl = url

  try {
    const headers = new Headers()
    applyProxyAuth(headers)
    const token = await getAccessToken()
    if (token) applyAuthHeader(headers, token)
    const res = await fetch(url, { headers })
    if (!res.ok) return
    const blob = await res.blob()

    const audio = el()
    audio.pause()
    releaseUrl()
    currentObjectUrl = URL.createObjectURL(blob)
    audio.src = currentObjectUrl
    await audio.play()
    setAudioBlocked(false)
  } catch (err) {
    // Autoplay policy: the browser wants a user gesture first. Remembered for the Settings
    // status line rather than toasted - a wall panel would otherwise stack notices.
    if (err instanceof DOMException && err.name === 'NotAllowedError') setAudioBlocked(true)
    releaseUrl()
  }
}
