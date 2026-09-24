// the stream is fetched rather than assigned as src, so the token can ride along - an <audio> element sends no
// headers
import { applyAuthHeader, applyProxyAuth, getAccessToken } from '../api/auth'
import { setAudioBlocked } from '../store/audio'

let element: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
// the clip being fetched or played, so the same event arriving twice plays it once; cleared when it is done,
// or the same doorbell twice in a row would be heard once
let lastUrl = ''
// the newest request wins: an older fetch that lands later must not start over it, and a stop while a
// fetch is in flight stays a stop
let generation = 0
let inflight: AbortController | null = null

function el(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.addEventListener('ended', () => {
      releaseUrl()
      lastUrl = ''
    })
  }
  return element
}

function releaseUrl(): void {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

function supersede(): number {
  inflight?.abort()
  inflight = null
  return ++generation
}

export function stopAudio(): void {
  supersede()
  lastUrl = ''
  if (!element) return
  element.pause()
  element.removeAttribute('src')
  releaseUrl()
}

export async function playAudioUrl(url: string): Promise<void> {
  if (!url) {
    stopAudio()
    return
  }
  if (url === lastUrl) return
  lastUrl = url
  const gen = supersede()
  const controller = new AbortController()
  inflight = controller

  try {
    const headers = new Headers()
    applyProxyAuth(headers)
    const token = await getAccessToken()
    if (token) applyAuthHeader(headers, token)
    if (gen !== generation) return
    const res = await fetch(url, { headers, signal: controller.signal })
    if (gen !== generation) return
    if (!res.ok) {
      lastUrl = ''
      return
    }
    const blob = await res.blob()
    if (gen !== generation) return

    const audio = el()
    audio.pause()
    releaseUrl()
    currentObjectUrl = URL.createObjectURL(blob)
    audio.src = currentObjectUrl
    await audio.play()
    if (gen === generation) setAudioBlocked(false)
  } catch (err) {
    // a newer request's pause() rejects this play(), and its abort rejects this fetch: neither is a failure
    if (gen !== generation) return
    if (err instanceof DOMException && err.name === 'NotAllowedError') setAudioBlocked(true)
    lastUrl = ''
    releaseUrl()
  } finally {
    if (inflight === controller) inflight = null
  }
}
