// the stream is fetched rather than assigned as src, so the token can ride along - an <audio> element sends no
// headers
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

export async function playAudioUrl(url: string): Promise<void> {
  if (!url) {
    stopAudio()
    return
  }
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
    if (err instanceof DOMException && err.name === 'NotAllowedError') setAudioBlocked(true)
    releaseUrl()
  }
}
